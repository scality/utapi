import requests
import redis
import json
import ast
import sys
import time
import urllib
import re
import sys
from threading import Thread
from concurrent.futures import ThreadPoolExecutor

import argparse

def get_options():
    parser = argparse.ArgumentParser()
    parser.add_argument("-i", "--sentinel-ip", default='127.0.0.1', help="Sentinel IP")
    parser.add_argument("-p", "--sentinel-port", default="16379", help="Sentinel Port")
    parser.add_argument("-v", "--redis-password", default=None, help="Redis AUTH Password")
    parser.add_argument("-n", "--sentinel-cluster-name", default='scality-s3', help="Redis cluster name")
    parser.add_argument("-b", "--bucketd-addr", default='http://127.0.0.1:9000', help="URL of the bucketd server")
    return parser.parse_args()

def safe_print(content):
    print("{0}".format(content))


class askRedis():

    def __init__(self, ip="127.0.0.1", port="16379", sentinel_cluster_name="scality-s3", password=None):
        self._password = password
        r = redis.Redis(host=ip, port=port, db=0, password=password)
        self._ip, self._port = r.sentinel_get_master_addr_by_name(sentinel_cluster_name)

    def read(self, resource, name):
        r = redis.Redis(host=self._ip, port=self._port, db=0, password=self._password)
        res = 's3:%s:%s:storageUtilized:counter' % (resource, name)
        total_size = r.get(res)
        res = 's3:%s:%s:numberOfObjects:counter' % (resource, name)
        files = r.get(res)
        try:
            return {'files': int(files), "total_size": int(total_size)}
        except Exception as e:
            return {'files': 0, "total_size": 0}


class S3ListBuckets():

    def __init__(self, host='127.0.0.1:9000'):
        self.bucketd_host = host

    def run(self):
        docs = []
        url = "%s/default/bucket/users..bucket" % self.bucketd_host
        session = requests.Session()
        r = session.get(url, timeout=30)
        if r.status_code == 200:
            payload = json.loads(r.text)
            for keys in payload['Contents']:
                key = keys["key"]
                r1 = re.match("(\w+)..\|..(\w+.*)", key)
                docs.append(r1.groups())

        return docs

        return(self.userid, self.bucket, user, files, total_size)

if __name__ == '__main__':
    options = get_options()
    redis_conf = dict(
        ip=options.sentinel_ip,
        port=options.sentinel_port,
        sentinel_cluster_name=options.sentinel_cluster_name,
        password=options.redis_password
    )

    P = S3ListBuckets(options.bucketd_addr)
    listbuckets = P.run()

    userids = set([x for x, y in listbuckets])

    executor = ThreadPoolExecutor(max_workers=1)
    for userid, bucket in listbuckets:
        U = askRedis(**redis_conf)
        data = U.read('buckets', bucket)
        content = "Account:%s|Bucket:%s|NumberOFfiles:%s|StorageCapacity:%s " % (
            userid, bucket, data["files"], data["total_size"])
        executor.submit(safe_print, content)
        data = U.read('buckets', 'mpuShadowBucket'+bucket)
        content = "Account:%s|Bucket:%s|NumberOFfiles:%s|StorageCapacity:%s " % (
            userid, 'mpuShadowBucket'+bucket, data["files"], data["total_size"])
        executor.submit(safe_print, content)


    executor.submit(safe_print, "")
    for userid in sorted(userids):
        U = askRedis(**redis_conf)
        data = U.read('accounts', userid)
        content = "Account:%s|NumberOFfiles:%s|StorageCapacity:%s " % (
            userid, data["files"], data["total_size"])
        executor.submit(safe_print, content)