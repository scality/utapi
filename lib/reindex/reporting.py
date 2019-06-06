import requests
from redis.sentinel import Sentinel
import json
import ast
import sys
import time
import urllib
import re
import sys
from threading import Thread
from concurrent.futures import ThreadPoolExecutor

if len(sys.argv) == 6:
    ip = sys.argv[1]
    port = sys.argv[2]
    sentinel_cluster_name = sys.argv[3]
    sentinel_password = sys.argv[4]
    bucketd_host = sys.argv[5]
    bucketd_port = sys.argv[6]
    print("Sentinel IP used: %s" % ip)
    print("Sentinel port used: %s" % port)
    print("Sentinel cluster name used: %s" % sentinel_cluster_name)
    print("BucketD host used: %s" % bucketd_host)
    print("BucketD port used: %s" % bucketd_port)
else:
    ip = "127.0.0.1"
    port = "16379"
    sentinel_cluster_name = "scality-s3"
    sentinel_password = ''
    bucketd_host =  "127.0.0.1"
    bucketd_port = "9000"


def safe_print(content):
    print("{0}".format(content))


class askRedis():

    def __init__(self, ip="127.0.0.1", port="16379", sentinel_cluster_name="scality-s3"):

        r = redis.sentinel([(host, port)], password=sentinel_password)
        self._ip, self._port = r.sentinel_get_master_addr_by_name(sentinel_cluster_name)

    def read(self, resource, name):

        r = redis.sentinel([(host, port)], password=sentinel_password)
        res = 's3:%s:%s:storageUtilized:counter' % (resource, name)
        total_size = r.get(res)
        res = 's3:%s:%s:numberOfObjects:counter' % (resource, name)
        files = r.get(res)
        return {'files': int(files), "total_size": int(total_size)}


class S3ListBuckets():

    def __init__(self, ip="127.0.0.1", bucketd_port="9000"):

        self.ip = ip
        self.bucketd_port = bucketd_port

    def run(self):

        docs = []
        url = "http://%s:%s/default/bucket/users..bucket" % (self.ip, self.bucketd_port)
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


P = S3ListBuckets(ip=bucketd_host, bucketd_port=bucketd_port)
listbuckets = P.run()

userids = set([x for x, y in listbuckets])

executor = ThreadPoolExecutor(max_workers=1)
for userid, bucket in listbuckets:
    U = askRedis(ip, port, sentinel_cluster_name)
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
    U = askRedis(ip, port, sentinel_cluster_name)
    data = U.read('accounts', userid)
    content = "Account:%s|NumberOFfiles:%s|StorageCapacity:%s " % (
        userid, data["files"], data["total_size"])
    executor.submit(safe_print, content)