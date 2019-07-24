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

if len(sys.argv) == 7:
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


class updateRedis():

    def __init__(self, ip="127.0.0.1", port="16379", sentinel_cluster_name="scality-s3"):

        r = redis.Redis(host=ip, port=port, db=0, password=sentinel_password)
        self._ip, self._port = r.sentinel_get_master_addr_by_name(sentinel_cluster_name)

    def read(self, resource, name):

        r = redis.Redis(host=self._ip, port=self._port, db=0, password=sentinel_password)
        store = r.get('s3:'+resource+':'+name+':storageUtilized:counter')
        nbr = r.get('s3:'+resource+':'+name+':numberOfObjects:counter')
        print("Redis:%s:%s:%s" % (name,int(nbr),int(store)))

    def update(self, resource, name, size, files):

        timestamp = int(time.time() - 15 * 60) * 1000
        r = redis.Redis(host=self._ip, port=self._port, db=0, password=sentinel_password)

        numberOfObjects = 's3:%s:%s:numberOfObjects' % (resource, name)
        storageUtilized = 's3:%s:%s:storageUtilized' % (resource, name)

        r.zremrangebyscore(numberOfObjects, timestamp, timestamp)
        r.zremrangebyscore(storageUtilized, timestamp, timestamp)
        r.zadd(storageUtilized, {size: timestamp})
        r.zadd(numberOfObjects, {files: timestamp})

        numberOfObjectsCounter = 's3:%s:%s:numberOfObjects:counter' % (
            resource, name)
        storageUtilizedCounter = 's3:%s:%s:storageUtilized:counter' % (
            resource, name)
        r.set(numberOfObjectsCounter, files)
        r.set(storageUtilizedCounter, size)


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


class S3BucketD(Thread):

    def __init__(self, userid=None, bucket=None, mpu=False, seekeys=False, ip="127.0.0.1", bucketd_port="9000"):

        Thread.__init__(self)
        self.userid = userid
        self.bucket = bucket
        self.mpu = mpu
        self.files = 0
        self.total_size = 0
        if self.mpu:
            self.bucket = "mpuShadowBucket"+bucket
        self.ip = ip
        self.bucketd_port = bucketd_port;

    def listbucket(self, session=None, marker="", versionmarker=""):
        m = marker.encode('utf8')
        mark = urllib.parse.quote_plus(m)
        v = versionmarker.encode('utf8')
        versionmarker = urllib.parse.quote_plus(v)
        params = "%s?listingType=DelimiterVersions&maxKeys=1000&keyMarker=%s&versionIdMarker=%s" % (
            self.bucket, mark, versionmarker)
        url = "http://%s:%s/default/bucket/%s" % (self.ip, self.bucketd_port, params)
        r = session.get(url, timeout=30)
        if r.status_code == 200:
            payload = json.loads(r.text)
            Contents = payload["Versions"]
            return (r.status_code, payload, Contents)
        else:
            return (r.status_code, "", "")

    def retkeys(self, Contents):
        total_size = 0
        files = 0
        key = ""
        versionId = ""
        for keys in Contents:
            key = keys["key"]
            pfixed = keys["value"].replace('false', 'False')
            pfixed = pfixed.replace('null', 'None')
            pfixed = pfixed.replace('true', 'True')
            data = ast.literal_eval(pfixed)
            if keys.get("versionId", ""):
                versionId = keys["versionId"]
            try:
                total_size += data["content-length"]
                files += 1
            except:
                continue
        return (key, total_size, files, versionId)

    def run(self):

        total_size = 0
        files = 0
        Truncate = True
        key = ""
        versionId = ""
        while Truncate:
            session = requests.Session()
            error, payload, Contents = self.listbucket(session, key, versionId)
            if error == 404:
                break
            Truncate = payload["IsTruncated"]
            key, size, file, versionId = self.retkeys(Contents)
            total_size += size
            files += file
        self.files = files
        self.total_size = total_size
        content = "%s:%s:%s:%s" % (
            self.userid, self.bucket, files, total_size)
        executor = ThreadPoolExecutor(max_workers=1)
        executor.submit(safe_print, content)
        return(self.userid, self.bucket, files, total_size)


P = S3ListBuckets(ip=bucketd_host, bucketd_port=bucketd_port)
listbuckets = P.run()

th = []
report = {}

for userid, bucket in listbuckets:
    th.append(S3BucketD(userid=userid, bucket=bucket, ip=bucketd_host, bucketd_port=bucketd_port))

for userid, bucket in listbuckets:
    th.append(S3BucketD(userid=userid, bucket=bucket, mpu=True, ip=bucketd_host, bucketd_port=bucketd_port))

for i in th:
    i.start()

for i in th:
    i.join()

for i in th:
    U = updateRedis(ip, port, sentinel_cluster_name)
    U.update('buckets', i.bucket, i.total_size, i.files)
    usereport = report.get(i.userid, False)
    if usereport:
        files = i.files + report[i.userid]["files"]
        total_size = i.total_size + report[i.userid]["total_size"]
        report[i.userid] = {"files": files, "total_size": total_size}
    else:
        report[i.userid] = {"files": i.files, "total_size": i.total_size}

for rep in report:
    print("Tool :%s:%s:%s" % (rep,report[rep]['files'],report[rep]['total_size']))
    U = updateRedis(ip, port, sentinel_cluster_name)
    U.update('accounts', rep, report[rep]['total_size'], report[rep]['files'])
    U.read('accounts', rep)
