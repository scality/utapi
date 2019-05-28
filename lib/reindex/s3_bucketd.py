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


class updateRedis():

    def __init__(self, ip="127.0.0.1", port="16379"):

        r = redis.Redis(host=ip, port=port, db=0)
        self._ip, self._port = r.sentinel_get_master_addr_by_name('scality-s3')

    def read(self, ressource, name):

        r = redis.Redis(host=self._ip, port=self._port, db=0)
        store = r.get('s3:'+ressource+':'+name+':storageUtilized:counter')
        nbr = r.get('s3:'+ressource+':'+name+':numberOfObjects:counter')
        print("Redis:%s:%s:%s" % (name,int(nbr),int(store)))

    def update(self, ressource, name, size, files):

        timestamp = int(time.time() - 15 * 60) * 1000
        r = redis.Redis(host=self._ip, port=self._port, db=0)

        numberOfObjects = 's3:%s:%s:numberOfObjects' % (ressource, name)
        storageUtilized = 's3:%s:%s:storageUtilized' % (ressource, name)

        r.zremrangebyscore(numberOfObjects, timestamp, timestamp)
        r.zremrangebyscore(storageUtilized, timestamp, timestamp)
        r.zadd(storageUtilized, {size: timestamp})
        r.zadd(numberOfObjects, {files: timestamp})

        numberOfObjectsCounter = 's3:%s:%s:numberOfObjects:counter' % (
            ressource, name)
        storageUtilizedCounter = 's3:%s:%s:storageUtilized:counter' % (
            ressource, name)
        r.set(numberOfObjectsCounter, files)
        r.set(storageUtilizedCounter, size)


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


class S3BucketD(Thread):

    def __init__(self, userid=None, bucket=None, mpu=False, seekeys=False, ip="127.0.0.1"):

        Thread.__init__(self)
        self.userid = userid
        self.bucket = bucket
        self.mpu = mpu
        self.files = 0
        self.total_size = 0
        if self.mpu:
            self.bucket = "mpuShadowBucket"+bucket
        self.seekeys = seekeys
        self.ip = ip

    def listbucket(self, session=None, marker=""):
        m = marker.encode('utf8')
        mark = urllib.parse.quote_plus(m)
        params = "%s?listingType=DelimiterMaster&maxKeys=1000&marker=%s" % (
            self.bucket, mark)
        url = "http://%s:9000/default/bucket/%s" % (self.ip, params)
        r = session.get(url, timeout=30)
        if r.status_code == 200:
            payload = json.loads(r.text)
            Contents = payload["Contents"]
            return (r.status_code, payload, Contents)
        else:
            return (r.status_code, "", "")

    def retkeys(self, Contents):
        total_size = 0
        files = 0
        key = ""
        user = "Unknow"
        for keys in Contents:
            key = keys["key"]
            pfixed = keys["value"].replace('false', 'False')
            pfixed = pfixed.replace('null', 'None')
            pfixed = pfixed.replace('true', 'True')
            data = ast.literal_eval(pfixed)
            try:
                total_size += data["content-length"]
            except:
                continue
            files += 1
            if self.mpu == 0:
                user = data["owner-display-name"]
            else:
                if self.seekeys == 1:
                    try:
                        print(data["partLocations"][0]["key"])
                    except Exception as e:
                        continue
                user = "mpu_user"
        return (key, total_size, user, files)

    def run(self):

        total_size = 0
        files = 0
        Truncate = True
        key = ''
        while Truncate:
            while 1:
                try:
                    session = requests.Session()
                    error, payload, Contents = self.listbucket(session, key)
                    if error == 200:
                        break
                    elif error == 404:
                        sys.exit(1)
                    time.sleep(15)
                except Exception as e:
                    print("ERROR:%s" % e)

            Truncate = payload["IsTruncated"]
            key, size, user, file = self.retkeys(Contents)
            total_size += size
            files += file
        self.files = files
        self.user = user
        self.total_size = total_size
        content = "%s:%s:%s:%s:%s" % (
            self.userid, self.bucket, user, files, total_size)
        executor = ThreadPoolExecutor(max_workers=1)
        executor.submit(safe_print, content)
        return(self.userid, self.bucket, user, files, total_size)


P = S3ListBuckets()
listbuckets = P.run()

th = []
report = {}

for userid, bucket in listbuckets:
    th.append(S3BucketD(userid=userid, bucket=bucket))

for userid, bucket in listbuckets:
    th.append(S3BucketD(userid=userid, bucket=bucket, mpu=True))

for i in th:
    i.start()

for i in th:
    i.join()

for i in th:
    U = updateRedis(ip)
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
    U = updateRedis(ip)
    U.update('accounts', rep, report[rep]['total_size'], report[rep]['files'])
    U.read('accounts', rep)
