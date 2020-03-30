import argparse
import json
import logging
import os
import re
import sys
import time
import urllib
from collections import defaultdict, namedtuple
from concurrent.futures import ThreadPoolExecutor
import concurrent.futures as futures
from pprint import pprint

import redis
import requests
from requests import ConnectionError, HTTPError, Timeout
import itertools

logging.basicConfig(level=logging.ERROR)
_log = logging.getLogger('utapi-reindex')

USERS_BUCKET = 'users..bucket'
MPU_SHADOW_BUCKET_PREFIX = 'mpuShadowBucket'

ACCOUNT_UPDATE_CHUNKSIZE = 100

def get_options():
    parser = argparse.ArgumentParser()
    parser.add_argument("-i", "--sentinel-ip", default='127.0.0.1', help="Sentinel IP")
    parser.add_argument("-p", "--sentinel-port", default="16379", help="Sentinel Port")
    parser.add_argument("-v", "--redis-password", default=None, help="Redis AUTH Password")
    parser.add_argument("-n", "--sentinel-cluster-name", default='scality-s3', help="Redis cluster name")
    parser.add_argument("-s", "--bucketd-addr", default='http://127.0.0.1:9000', help="URL of the bucketd server")
    parser.add_argument("-w", "--worker", default=10, help="Number of workers")
    parser.add_argument("-b", "--bucket", default=False, help="Bucket to be processed")
    return parser.parse_args()

def chunks(iterable,size):
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

Bucket = namedtuple('Bucket', ['userid', 'name'])
MPU = namedtuple('MPU', ['bucket', 'key', 'upload_id'])
BucketContents = namedtuple('BucketContents', ['bucket', 'obj_count', 'total_size'])

class BucketDClient:

    '''Performs Listing calls against bucketd'''
    __url_format = '{addr}/default/bucket/{bucket}'
    __headers = {"x-scal-request-uids": "utapi-reindex-list-buckets"}

    def __init__(self, bucketd_addr=None):
        self._bucketd_addr = bucketd_addr
        self._session = requests.Session()
        self.__bucketd_is_v7 = None

    def _do_req(self, url, check_500=True, **kwargs):
        while True:
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
        url = self.__url_format.format(addr=self._bucketd_addr, bucket=bucket)
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
                if resp.status_code == 200:
                    payload = resp.json()
            except ValueError as e:
                _log.exception(e)
                _log.error('Invalid listing response body! bucket:%s params:%s'%(
                    bucket, ', '.join('%s=%s'%p for p in params.items())))
                continue
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

    @property
    def _bucketd_is_v7(self):
        if self.__bucketd_is_v7 is None:
            url = '{}/_/raft_sessions/1/leader'.format(self._bucketd_addr)
            resp = self._do_req(url, check_500=False)
            self.__bucketd_is_v7 = resp.status_code == 200
        return self.__bucketd_is_v7

    def list_buckets(self):

        def get_next_marker(p):
            if p is None:
                return ''
            return p.get('Contents', [{}])[-1].get('key', '')

        params = {
            'delimiter': '',
            'maxKeys': 1000,
            'marker': get_next_marker
        }
        for _, payload in self._list_bucket(USERS_BUCKET, **params):
            buckets = []
            for result in payload['Contents']:
                match = re.match("(\w+)..\|..(\w+.*)", result['key'])
                buckets.append(Bucket(*match.groups()))
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

    def _sum_objects(self, listing):
        count = 0
        total_size = 0
        for _, payload in listing:
            contents = payload['Contents'] if isinstance(payload, dict) else payload
            for obj in contents:
                count += 1
                if isinstance(obj['value'], dict):
                    # bucketd v6 returns a dict:
                    data = obj.get('value', {})
                    total_size += data["Size"]
                else:
                    # bucketd v7 returns an encoded string
                    data = json.loads(obj['value'])
                    total_size += data["content-length"]
        return count, total_size

    def count_bucket_contents(self, bucket):

        def get_next_marker(p):
            if p is None or len(p) == 0:
                return ''
            return p[-1].get('key', '')

        params = {
            'listingType': 'Basic',
            'maxKeys': 1000,
            'gt': get_next_marker,
        }

        count, total_size = self._sum_objects(self._list_bucket(bucket.name, **params))
        return BucketContents(
            bucket=bucket,
            obj_count=count,
            total_size=total_size
        )

    def count_mpu_parts(self, mpu):
        _bucket = MPU_SHADOW_BUCKET_PREFIX + mpu.bucket.name

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

        count, total_size = self._sum_objects(self._list_bucket(_bucket, **params))
        return BucketContents(
            bucket=mpu.bucket._replace(name=_bucket),
            obj_count=count,
            total_size=total_size
        )


def index_bucket(client, bucket):
    '''
        Takes an instance of BucketDClient and a bucket name, and returns a
        tuple of BucketContents for the passed bucket and its mpu shadow bucket.
    '''
    bucket_total = client.count_bucket_contents(bucket)
    mpus = client.list_mpus(bucket)
    shadowbucket = bucket._replace(name=MPU_SHADOW_BUCKET_PREFIX + bucket.name)
    if not mpus:
        mpu_total = BucketContents(shadowbucket, 0, 0)
    else:
        mpu_totals = [client.count_mpu_parts(m) for m in mpus]
        mpu_part_count = 0
        mpu_total_size = 0
        for mpu in mpu_totals:
            mpu_part_count += mpu.obj_count
            mpu_total_size += mpu.total_size
        mpu_total = BucketContents(
                shadowbucket,
                mpu_part_count,
                mpu_total_size
            )
    return bucket_total, mpu_total


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
        password=options.redis_password
    )
    ip, port = sentinel.sentinel_get_master_addr_by_name(options.sentinel_cluster_name)
    return redis.Redis(
        host=ip,
        port=port,
        db=0,
        password=options.redis_password
    )

def update_redis(client, resource, name, obj_count, total_size):
    timestamp = int(time.time() - 15 * 60) * 1000
    obj_count_key = 's3:%s:%s:numberOfObjects' % (resource, name)
    total_size_key = 's3:%s:%s:storageUtilized' % (resource, name)
    
    client.zremrangebyscore(obj_count_key, timestamp, timestamp)
    client.zremrangebyscore(total_size_key, timestamp, timestamp)
    client.zadd(obj_count_key, {obj_count: timestamp})
    client.zadd(total_size_key, {total_size: timestamp})
    client.set(obj_count_key + ':counter', obj_count)
    client.set(total_size_key + ':counter', total_size)

def log_report(resource, name, obj_count, total_size):
    print('%s:%s:%s:%s'%(
        resource,
        name,
        obj_count,
        total_size
    ))

if __name__ == '__main__':
    options = get_options()
    bucket_client = BucketDClient(options.bucketd_addr)
    redis_client = get_redis_client(options)
    account_reports = {}
    with ThreadPoolExecutor(max_workers=options.worker) as executor:
        for batch in bucket_client.list_buckets():
            bucket_reports = {}    
            jobs = [executor.submit(index_bucket, bucket_client, b) for b in batch]
            for job in futures.as_completed(jobs):
                totals = job.result() # bucket and shadowbucket totals as tuple
                for total in totals:
                    update_report(bucket_reports, total.bucket.name, total.obj_count, total.total_size)
                    update_report(account_reports, total.bucket.userid, total.obj_count, total.total_size)
                    
            # Bucket reports can be updated as we get them
            pipeline = redis_client.pipeline(transaction=False)  # No transaction to reduce redis load
            for bucket, report in bucket_reports.items():
                update_redis(pipeline, 'buckets', bucket, report['obj_count'], report['total_size'])
                log_report('buckets', bucket, report['obj_count'], report['total_size'])
            pipeline.execute()

    # Update total account reports in chunks
    for chunk in chunks(account_reports.items(), ACCOUNT_UPDATE_CHUNKSIZE):
        pipeline = redis_client.pipeline(transaction=False) # No transaction to reduce redis load
        for userid, report in chunk:
            update_redis(pipeline, 'accounts', userid, report['obj_count'], report['total_size'])
            log_report('accounts', userid, report['obj_count'], report['total_size'])
        pipeline.execute() 
