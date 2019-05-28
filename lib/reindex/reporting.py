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

if len(sys.argv) == 2:
    ip = sys.argv[1]
    print("Sentinel IP used %s" % ip)
else:
    ip = "127.0.0.1"


def safe_print(content):
    print("{0}".format(content))


class askRedis():

    def __init__(self, ip="127.0.0.1", port="16379"):

        r = redis.Redis(host=ip, port=port, db=0)
        self._ip, self._port = r.sentinel_get_master_addr_by_name('scality-s3')

    def read(self, ressource, name):

        r = redis.Redis(host=self._ip, port=self._port, db=0)
        res = 's3:%s:%s:storageUtilized:counter' % (ressource, name)
        total_size = r.get(res)
        res = 's3:%s:%s:numberOfObjects:counter' % (ressource, name)
        files = r.get(res)
        return {'files': int(files), "total_size": int(total_size)}


class S3ListBuckets():

    def __init__(self, ip="127.0.0.1"):

        self.ip = ip

    def run(self):

        docs = []
        url = "http://%s:9000/default/bucket/users..bucket" % self.ip
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


P = S3ListBuckets()
listbuckets = P.run()

userids = set([x for x, y in listbuckets])

executor = ThreadPoolExecutor(max_workers=1)
for userid, bucket in listbuckets:
    U = askRedis(ip)
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
    U = askRedis(ip)
    data = U.read('accounts', userid)
    content = "Account:%s|NumberOFfiles:%s|StorageCapacity:%s " % (
        userid, data["files"], data["total_size"])
    executor.submit(safe_print, content)