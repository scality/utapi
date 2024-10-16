import argparse
import concurrent.futures as futures
import functools
import itertools
import json
import logging
import re
import sys
import time
import urllib
import uuid
from collections import namedtuple
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path

import redis
import requests
from requests import ConnectionError, Timeout

logging.basicConfig(level=logging.INFO)
_log = logging.getLogger('utapi-reindex')

USERS_BUCKET = 'users..bucket'
MPU_SHADOW_BUCKET_PREFIX = 'mpuShadowBucket'

ACCOUNT_UPDATE_CHUNKSIZE = 100

SENTINEL_CONNECT_TIMEOUT_SECONDS = 10
EXIT_CODE_SENTINEL_CONNECTION_ERROR = 100

def get_options():
    parser = argparse.ArgumentParser()
    parser.add_argument("-i", "--sentinel-ip", default='127.0.0.1', help="Sentinel IP")
    parser.add_argument("-p", "--sentinel-port", default="16379", help="Sentinel Port")
    parser.add_argument("-v", "--redis-password", default=None, help="Redis AUTH Password")
    parser.add_argument("-n", "--sentinel-cluster-name", default='scality-s3', help="Redis cluster name")
    parser.add_argument("-s", "--bucketd-addr", default='http://127.0.0.1:9000', help="URL of the bucketd server")
    parser.add_argument("-w", "--worker", default=10, type=int, help="Number of workers")
    parser.add_argument("-r", "--max-retries", default=2, type=int, help="Max retries before failing a bucketd request")
    parser.add_argument("--only-latest-when-locked", action='store_true', help="Only index the latest version of a key when the bucket has a default object lock policy")
    parser.add_argument("--debug", action='store_true', help="Enable debug logging")
    parser.add_argument("--dry-run", action="store_true", help="Do not update redis")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("-a", "--account", default=[], help="account canonical ID (all account buckets will be processed)", action="append", type=nonempty_string('account'))
    group.add_argument("--account-file", default=None, help="file containing account canonical IDs, one ID per line", type=existing_file)
    group.add_argument("-b", "--bucket", default=[], help="bucket name", action="append", type=nonempty_string('bucket'))
    group.add_argument("--bucket-file", default=None, help="file containing bucket names, one bucket name per line", type=existing_file)

    options = parser.parse_args()
    if options.bucket_file:
        with open(options.bucket_file) as f:
            options.bucket = [line.strip() for line in f if line.strip()]
    elif options.account_file:
        with open(options.account_file) as f:
            options.account = [line.strip() for line in f if line.strip()]

    return options

def nonempty_string(flag):
    def inner(value):
        if not value.strip():
            raise argparse.ArgumentTypeError("%s: value must not be empty"%flag)
        return value
    return inner

def existing_file(path):
    path = Path(path).resolve()
    if not path.exists():
        raise argparse.ArgumentTypeError("File does not exist: %s"%path)
    return path

def chunks(iterable, size):
    it = iter(iterable)
    chunk = tuple(itertools.islice(it,size))
    while chunk:
        yield chunk
        chunk = tuple(itertools.islice(it,size))

def _encoded(func):
    def inner(*args, **kwargs):
        val = func(*args, **kwargs)
        return urllib.parse.quote(val.encode('utf-8'))
    return inner

Bucket = namedtuple('Bucket', ['userid', 'name', 'object_lock_enabled'])
MPU = namedtuple('MPU', ['bucket', 'key', 'upload_id'])
BucketContents = namedtuple('BucketContents', ['bucket', 'obj_count', 'total_size'])

class MaxRetriesReached(Exception):
    def __init__(self, url):
        super().__init__('Max retries reached for request to %s'%url)

class InvalidListing(Exception):
    def __init__(self, bucket):
        super().__init__('Invalid contents found while listing bucket %s'%bucket)

class BucketNotFound(Exception):
    def __init__(self, bucket):
        super().__init__('Bucket %s not found'%bucket)

class BucketDClient:

    '''Performs Listing calls against bucketd'''
    __url_attribute_format = '{addr}/default/attributes/{bucket}'
    __url_bucket_format = '{addr}/default/bucket/{bucket}'
    __headers = {"x-scal-request-uids": "utapi-reindex-list-buckets"}

    def __init__(self, bucketd_addr=None, max_retries=2, only_latest_when_locked=False):
        self._bucketd_addr = bucketd_addr
        self._max_retries = max_retries
        self._only_latest_when_locked = only_latest_when_locked
        self._session = requests.Session()

    def _do_req(self, url, check_500=True, **kwargs):
        # Add 1 for the initial request
        for x in range(self._max_retries + 1):
            try:
                resp = self._session.get(url, timeout=30, verify=False, headers=self.__headers, **kwargs)
                if check_500 and resp.status_code == 500:
                    _log.warning('500 from bucketd, sleeping 15 secs')
                    time.sleep(15)
                    continue
                return resp
            except (Timeout, ConnectionError) as e:
                _log.exception(e)
                _log.error('Error during listing, sleeping 5 secs %s'%url)
                time.sleep(5)

        raise MaxRetriesReached(url)

    def _list_bucket(self, bucket, **kwargs):
        '''
        Lists a bucket lazily until "empty"
        bucket: name of the bucket
        kwargs: url parameters key=value

        To support multiple next marker keys and param encoding, a function can
        be passed as a parameters value. It will be call with the json decode
        response body as its only argument and is expected to return the
        parameters value. On the first request the function will be called with
        `None` and should return its initial value. Return `None` for the param to be excluded.
        '''
        url = self.__url_bucket_format.format(addr=self._bucketd_addr, bucket=bucket)
        static_params = {k: v for k, v in kwargs.items() if not callable(v)}
        dynamic_params = {k: v for k, v in kwargs.items() if callable(v)}
        is_truncated = True # Set to True for first loop
        payload = None
        while is_truncated:
            params = static_params.copy() # Use a copy of the static params for a base
            for key, func in dynamic_params.items():
                params[key] = func(payload) # Call each of our dynamic params with the previous payload
            try:
                _log.debug('listing bucket bucket: %s params: %s'%(
                    bucket, ', '.join('%s=%s'%p for p in params.items())))
                resp = self._do_req(url, params=params)
                if resp.status_code == 404:
                    _log.debug('Bucket not found bucket: %s'%bucket)
                    return
                if resp.status_code == 200:
                    payload = resp.json()
            except ValueError as e:
                _log.exception(e)
                _log.error('Invalid listing response body! bucket:%s params:%s'%(
                    bucket, ', '.join('%s=%s'%p for p in params.items())))
                continue
            except MaxRetriesReached:
                _log.error('Max retries reached listing bucket:%s'%bucket)
                raise
            except Exception as e:
                _log.exception(e)
                _log.error('Unhandled exception during listing! bucket:%s params:%s'%(
                    bucket, ', '.join('%s=%s'%p for p in params.items())))
                raise
            yield resp.status_code, payload
            if isinstance(payload, dict):
                is_truncated = payload.get('IsTruncated', False)
            else:
                is_truncated = len(payload) > 0

    @functools.lru_cache(maxsize=16)
    def _get_bucket_attributes(self, name):
        url = self.__url_attribute_format.format(addr=self._bucketd_addr, bucket=name)
        try:
            resp = self._do_req(url)
            if resp.status_code == 200:
                return resp.json()
            else:
                _log.error('Error getting bucket attributes bucket:%s status_code:%s'%(name, resp.status_code))
                raise BucketNotFound(name)
        except ValueError as e:
            _log.exception(e)
            _log.error('Invalid attributes response body! bucket:%s'%name)
            raise
        except MaxRetriesReached:
            _log.error('Max retries reached getting bucket attributes bucket:%s'%name)
            raise
        except Exception as e:
            _log.exception(e)
            _log.error('Unhandled exception getting bucket attributes bucket:%s'%name)
            raise

    def get_bucket_md(self, name):
        md = self._get_bucket_attributes(name)
        canonId = md.get('owner')
        if canonId is None:
            _log.error('No owner found for bucket %s'%name)
            raise InvalidListing(name)
        return Bucket(canonId, name, md.get('objectLockEnabled', False))

    def list_buckets(self, account=None):

        def get_next_marker(p):
            if p is None:
                return ''
            return p.get('Contents', [{}])[-1].get('key', '')

        params = {
            'delimiter': '',
            'maxKeys': 1000,
            'marker': get_next_marker
        }

        if account is not None:
            params['prefix'] = '%s..|..' % account

        for _, payload in self._list_bucket(USERS_BUCKET, **params):
            buckets = []
            for result in payload.get('Contents', []):
                match = re.match("(\w+)..\|..(\w+.*)", result['key'])
                bucket = Bucket(*match.groups(), False)
                # We need to get the attributes for each bucket to determine if it is locked
                if self._only_latest_when_locked:
                    bucket_attrs = self._get_bucket_attributes(bucket.name)
                    object_lock_enabled = bucket_attrs.get('objectLockEnabled', False)
                    bucket = bucket._replace(object_lock_enabled=object_lock_enabled)
                buckets.append(bucket)

            if buckets:
                yield buckets

    def list_mpus(self, bucket):
        _bucket = MPU_SHADOW_BUCKET_PREFIX + bucket.name

        def get_next_marker(p):
            if p is None:
                return 'overview..|..'
            return p.get('NextKeyMarker', '')

        def get_next_upload_id(p):
            if p is None:
                return 'None'
            return p.get('NextUploadIdMarker', '')

        params = {
            'delimiter': '',
            'keyMarker': '',
            'maxKeys': 1000,
            'queryPrefixLength': 0,
            'listingType': 'MPU',
            'splitter': '..|..',
            'prefix': get_next_marker,
            'uploadIdMarker': get_next_upload_id,
        }
        keys = []

        for status_code, payload in self._list_bucket(_bucket, **params):
            if status_code == 404:
                break
            for key in payload['Uploads']:
                keys.append(MPU(
                    bucket=bucket,
                    key=key['key'],
                    upload_id=key['value']['UploadId']))
        return keys

    def _sum_objects(self, bucket, listing, only_latest_when_locked = False):
        count = 0
        total_size = 0
        last_key = None
        try:
            for obj in listing:
                if isinstance(obj['value'], dict):
                    # bucketd v6 returns a dict:
                    data = obj.get('value', {})
                    size = data["Size"]
                else:
                    # bucketd v7 returns an encoded string
                    data = json.loads(obj['value'])
                    size = data.get('content-length', 0)

                is_latest = obj['key'] != last_key
                last_key = obj['key']

                if only_latest_when_locked and bucket.object_lock_enabled and not is_latest:
                    _log.debug('Skipping versioned key: %s'%obj['key'])
                    continue

                count += 1
                total_size += size

        except InvalidListing:
            _log.error('Invalid contents in listing. bucket:%s'%bucket.name)
            raise InvalidListing(bucket.name)
        return count, total_size

    def _extract_listing(self, key, listing):
        for status_code, payload in listing:
            contents = payload[key] if isinstance(payload, dict) else payload
            if contents is None:
                raise InvalidListing('')
            for obj in contents:
                yield obj

    def count_bucket_contents(self, bucket):

        def get_key_marker(p):
            if p is None:
                return ''
            return p.get('NextKeyMarker', '')

        def get_vid_marker(p):
            if p is None:
                return ''
            return p.get('NextVersionIdMarker', '')

        params = {
            'listingType': 'DelimiterVersions',
            'maxKeys': 1000,
            'keyMarker': get_key_marker,
            'versionIdMarker': get_vid_marker,
        }

        listing = self._list_bucket(bucket.name, **params)
        count, total_size = self._sum_objects(bucket, self._extract_listing('Versions', listing), self._only_latest_when_locked)
        return BucketContents(
            bucket=bucket,
            obj_count=count,
            total_size=total_size
        )

    def count_mpu_parts(self, mpu):
        shadow_bucket_name = MPU_SHADOW_BUCKET_PREFIX + mpu.bucket.name
        shadow_bucket = mpu.bucket._replace(name=shadow_bucket_name)

        def get_prefix(p):
            if p is None:
                return mpu.upload_id
            return p.get('Contents', [{}])[-1].get('key', '')

        @_encoded
        def get_next_marker(p):
            prefix = get_prefix(p)
            return prefix + '..|..00000'

        params = {
            'prefix': get_prefix,
            'marker': get_next_marker,
            'delimiter': '',
            'maxKeys': 1000,
            'listingType': 'Delimiter',
        }

        listing = self._list_bucket(shadow_bucket_name, **params)
        count, total_size = self._sum_objects(shadow_bucket, self._extract_listing('Contents', listing))
        return BucketContents(
            bucket=shadow_bucket,
            obj_count=0, # MPU parts are not counted towards numberOfObjects
            total_size=total_size
        )

def list_all_buckets(bucket_client):
    return bucket_client.list_buckets()

def list_specific_accounts(bucket_client, accounts):
    for account in accounts:
        yield from bucket_client.list_buckets(account=account)

def list_specific_buckets(bucket_client, buckets):
    batch = []
    for bucket in buckets:
        try:
            batch.append(bucket_client.get_bucket_md(bucket))
        except BucketNotFound:
            _log.error('Failed to list bucket %s. Removing from results.'%bucket)
            continue

    yield batch

def index_bucket(client, bucket):
    '''
        Takes an instance of BucketDClient and a bucket name, and returns a
        tuple of BucketContents for the passed bucket and its mpu shadow bucket.
    '''
    try:
        bucket_total = client.count_bucket_contents(bucket)
        mpus = client.list_mpus(bucket)
        if not mpus:
            return bucket_total

        total_size = bucket_total.total_size
        mpu_totals = [client.count_mpu_parts(m) for m in mpus]
        for mpu in mpu_totals:
            total_size += mpu.total_size

        return bucket_total._replace(total_size=total_size)
    except Exception as e:
        _log.exception(e)
        _log.error('Error during listing. Removing from results bucket:%s'%bucket.name)
        raise InvalidListing(bucket.name)

def update_report(report, key, obj_count, total_size):
    '''Convenience function to update the report dicts'''
    if key in report:
        report[key]['obj_count'] += obj_count
        report[key]['total_size'] += total_size
    else:
        report[key] = {
            'obj_count': obj_count,
            'total_size': total_size,
        }

def get_redis_client(options):
    sentinel = redis.Redis(
        host=options.sentinel_ip,
        port=options.sentinel_port,
        db=0,
        password=options.redis_password,
        socket_connect_timeout=SENTINEL_CONNECT_TIMEOUT_SECONDS
    )
    try:
        ip, port = sentinel.sentinel_get_master_addr_by_name(options.sentinel_cluster_name)
    except (redis.exceptions.ConnectionError, redis.exceptions.TimeoutError) as e:
        _log.error(f'Failed to connect to redis sentinel at {options.sentinel_ip}:{options.sentinel_port}: {e}')
        # use a specific error code to hint on retrying with another sentinel node
        sys.exit(EXIT_CODE_SENTINEL_CONNECTION_ERROR)

    return redis.Redis(
        host=ip,
        port=port,
        db=0,
        password=options.redis_password
    )

def update_redis(client, resource, name, obj_count, total_size):
    now = datetime.utcnow()
    # Round down to the nearest 15 minute interval
    rounded_minute = now.minute - (now.minute % 15)
    now = now.replace(minute=rounded_minute, second=0, microsecond=0)
    # Convert to milliseconds
    timestamp = int(now.timestamp()) * 1000
    obj_count_key = 's3:%s:%s:numberOfObjects' % (resource, name)
    total_size_key = 's3:%s:%s:storageUtilized' % (resource, name)
    obj_count_serialized = f"{obj_count}:{uuid.uuid4()}"
    total_size_serialized = f"{total_size}:{uuid.uuid4()}"

    client.zremrangebyscore(obj_count_key, timestamp, timestamp)
    client.zremrangebyscore(total_size_key, timestamp, timestamp)
    client.zadd(obj_count_key, {obj_count_serialized: timestamp})
    client.zadd(total_size_key, {total_size_serialized: timestamp})
    client.set(obj_count_key + ':counter', obj_count)
    client.set(total_size_key + ':counter', total_size)

def get_resources_from_redis(client, resource):
    for key in redis_client.scan_iter('s3:%s:*:storageUtilized' % resource):
        yield key.decode('utf-8').split(':')[2]

def log_report(resource, name, obj_count, total_size):
    print('%s:%s:%s:%s'%(
        resource,
        name,
        obj_count,
        total_size
    ))

if __name__ == '__main__':
    options = get_options()
    if options.debug:
        _log.setLevel(logging.DEBUG)

    bucket_client = BucketDClient(options.bucketd_addr, options.max_retries, options.only_latest_when_locked)
    redis_client = get_redis_client(options)
    account_reports = {}
    observed_buckets = set()
    failed_accounts = set()

    if options.account:
        batch_generator = list_specific_accounts(bucket_client, options.account)
    elif options.bucket:
        batch_generator = list_specific_buckets(bucket_client, options.bucket)
    else:
        batch_generator = list_all_buckets(bucket_client)

    with ThreadPoolExecutor(max_workers=options.worker) as executor:
        for batch in batch_generator:
            bucket_reports = {}
            jobs = { executor.submit(index_bucket, bucket_client, b): b for b in batch }
            for job in futures.as_completed(jobs.keys()):
                try:
                    total = job.result() # Summed bucket and shadowbucket totals
                except InvalidListing:
                    _bucket = jobs[job]
                    _log.error('Failed to list bucket %s. Removing from results.'%_bucket.name)
                    # Add the bucket to observed_buckets anyway to avoid clearing existing metrics
                    observed_buckets.add(_bucket.name)
                    # If we can not list one of an account's buckets we can not update its total
                    failed_accounts.add(_bucket.userid)
                    continue
                observed_buckets.add(total.bucket.name)
                update_report(bucket_reports, total.bucket.name, total.obj_count, total.total_size)
                update_report(account_reports, total.bucket.userid, total.obj_count, total.total_size)

            # Bucket reports can be updated as we get them
            if options.dry_run:
                for bucket, report in bucket_reports.items():
                    _log.info(
                        "DryRun: resource buckets [%s] would be updated with obj_count %i and total_size %i" % (
                            bucket, report['obj_count'], report['total_size']
                        )
                    )
            else:
                pipeline = redis_client.pipeline(transaction=False)  # No transaction to reduce redis load
                for bucket, report in bucket_reports.items():
                    update_redis(pipeline, 'buckets', bucket, report['obj_count'], report['total_size'])
                    log_report('buckets', bucket, report['obj_count'], report['total_size'])
                pipeline.execute()

    stale_buckets = set()
    recorded_buckets = set(get_resources_from_redis(redis_client, 'buckets'))
    if options.bucket:
        stale_buckets = { b for b in options.bucket if b not in observed_buckets }
    elif options.account:
        _log.warning('Stale buckets will not be cleared when using the --account or --account-file flags')
    else:
        stale_buckets = recorded_buckets.difference(observed_buckets)

    _log.info('Found %s stale buckets' % len(stale_buckets))
    if options.dry_run:
        _log.info("DryRun: not updating stale buckets")
    else:
        for chunk in chunks(stale_buckets, ACCOUNT_UPDATE_CHUNKSIZE):
            pipeline = redis_client.pipeline(transaction=False) # No transaction to reduce redis load
            for bucket in chunk:
                update_redis(pipeline, 'buckets', bucket, 0, 0)
                log_report('buckets', bucket, 0, 0)
            pipeline.execute()

    # Account metrics are not updated if a bucket is specified
    if options.bucket:
        _log.warning('Account metrics will not be updated when using the --bucket or --bucket-file flags')
    else:
        # Don't update any accounts with failed listings
        without_failed = filter(lambda x: x[0] not in failed_accounts, account_reports.items())
        if options.dry_run:
            for userid, report in account_reports.items():
                _log.info(
                    "DryRun: resource account [%s] would be updated with obj_count %i and total_size %i" % (
                        userid, report['obj_count'], report['total_size']
                    )
                )
        else:
            # Update total account reports in chunks
            for chunk in chunks(without_failed, ACCOUNT_UPDATE_CHUNKSIZE):
                pipeline = redis_client.pipeline(transaction=False) # No transaction to reduce redis load
                for userid, report in chunk:
                    update_redis(pipeline, 'accounts', userid, report['obj_count'], report['total_size'])
                    log_report('accounts', userid, report['obj_count'], report['total_size'])
                pipeline.execute()

        if options.account:
            for account in options.account:
                if account in failed_accounts:
                    _log.error("No metrics updated for account %s, one or more buckets failed" % account)

        # Include failed_accounts in observed_accounts to avoid clearing metrics
        observed_accounts = failed_accounts.union(set(account_reports.keys()))
        recorded_accounts = set(get_resources_from_redis(redis_client, 'accounts'))

        if options.account:
            stale_accounts = { a for a in options.account if a not in observed_accounts }
        else:
            # Stale accounts and buckets are ones that do not appear in the listing, but have recorded values
            stale_accounts = recorded_accounts.difference(observed_accounts)

        _log.info('Found %s stale accounts' % len(stale_accounts))
        if options.dry_run:
            _log.info("DryRun: not updating stale accounts")
        else:
            for chunk in chunks(stale_accounts, ACCOUNT_UPDATE_CHUNKSIZE):
                pipeline = redis_client.pipeline(transaction=False) # No transaction to reduce redis load
                for account in chunk:
                    update_redis(pipeline, 'accounts', account, 0, 0)
                    log_report('accounts', account, 0, 0)
                pipeline.execute()
