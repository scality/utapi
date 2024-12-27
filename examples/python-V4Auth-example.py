import sys, os, base64, datetime, hashlib, hmac, datetime, calendar, json
import requests # pip install requests

access_key = '9EQTVVVCLSSG6QBMNKO5'
secret_key = 'T5mK/skkkwJ/mTjXZnHyZ5UzgGIN=k9nl4dyTmDH'

method = 'POST'
service = 's3'
host = 'localhost:8100'
region = 'us-east-1'
canonical_uri = '/buckets'
canonical_querystring = 'Action=ListMetrics&Version=20160815'
content_type = 'application/x-amz-json-1.0'
algorithm = 'AWS4-HMAC-SHA256'

t = datetime.datetime.utcnow()
amz_date = t.strftime('%Y%m%dT%H%M%SZ')
date_stamp = t.strftime('%Y%m%d')

# Key derivation functions. See:
# http://docs.aws.amazon.com/general/latest/gr/signature-v4-examples.html#signature-v4-examples-python
def sign(key, msg):
    return hmac.new(key, msg.encode("utf-8"), hashlib.sha256).digest()

def getSignatureKey(key, date_stamp, regionName, serviceName):
    kDate = sign(('AWS4' + key).encode('utf-8'), date_stamp)
    kRegion = sign(kDate, regionName)
    kService = sign(kRegion, serviceName)
    kSigning = sign(kService, 'aws4_request')
    return kSigning

def get_start_time(t):
    start = t.replace(minute=t.minute - t.minute % 15, second=0, microsecond=0)
    return calendar.timegm(start.utctimetuple()) * 1000;

def get_end_time(t):
    end = t.replace(minute=t.minute - t.minute % 15, second=0, microsecond=0)
    return calendar.timegm(end.utctimetuple()) * 1000 - 1;

start_time = get_start_time(datetime.datetime(2016, 1, 1, 0, 0, 0, 0))
end_time = get_end_time(datetime.datetime(2016, 2, 1, 0, 0, 0, 0))

# Request parameters for listing Utapi bucket metrics--passed in a JSON block.
bucketListing = {
    'buckets': [ 'utapi-test' ],
    'timeRange': [ start_time, end_time ],
}

request_parameters = json.dumps(bucketListing)

payload_hash = hashlib.sha256(request_parameters).hexdigest()

canonical_headers = \
    'content-type:{0}\nhost:{1}\nx-amz-content-sha256:{2}\nx-amz-date:{3}\n' \
    .format(content_type, host, payload_hash, amz_date)

signed_headers = 'content-type;host;x-amz-content-sha256;x-amz-date'

canonical_request = '{0}\n{1}\n{2}\n{3}\n{4}\n{5}' \
    .format(method, canonical_uri, canonical_querystring, canonical_headers,
            signed_headers, payload_hash)

credential_scope = '{0}/{1}/{2}/aws4_request' \
    .format(date_stamp, region, service)

string_to_sign = '{0}\n{1}\n{2}\n{3}' \
    .format(algorithm, amz_date, credential_scope,
            hashlib.sha256(canonical_request).hexdigest())

signing_key = getSignatureKey(secret_key, date_stamp, region, service)

signature = hmac.new(signing_key, (string_to_sign).encode('utf-8'),
                     hashlib.sha256).hexdigest()

authorization_header = \
    '{0} Credential={1}/{2}, SignedHeaders={3}, Signature={4}' \
    .format(algorithm, access_key, credential_scope, signed_headers, signature)

# The 'host' header is added automatically by the Python 'requests' library.
headers = {
    'Content-Type': content_type,
    'X-Amz-Content-Sha256': payload_hash,
    'X-Amz-Date': amz_date,
    'Authorization': authorization_header
}

endpoint = 'http://' + host + canonical_uri + '?' + canonical_querystring;

r = requests.post(endpoint, data=request_parameters, headers=headers)
print (r.text)
