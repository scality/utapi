# utapi

![Utapi logo](res/utapi-logo.png)

[![Circle CI][badgepub]](https://circleci.com/gh/scality/utapi)
[![Scality CI][badgepriv]](http://ci.ironmann.io/gh/scality/utapi)

Service Utilization API for tracking resource usage and metrics reporting

## Design

Please refer to the [design](/DESIGN.md) for more information.

## Client

The module exposes a client, named UtapiClient. Projects can use this client to
push metrics directly to the underlying datastore (Redis) without the need of an
extra HTTP request to Utapi.

```js
const { UtapiClient } = require('utapi');

const config = {
    redis: {
        host: '127.0.0.1',
        port: 6379
    },
    localCache: {
        host: '127.0.0.1',
        port: 6379
    }
}
const c = new UtapiClient(config);

// The second argument to `pushMetric` is a hexadecimal string Request Unique
// Identifier used for logging.
c.pushMetric('createBucket', '3d534b1511e5630e68f0', { bucket: 'demo' });

c.pushMetric('putObject', '3d534b1511e5630e68f0', {
    bucket: 'demo',
    newByteLength: 1024,
    oldByteLength: null,
});

c.pushMetric('putObject', '3d534b1511e5630e68f0', {
    bucket: 'demo',
    newByteLength: 1024,
    oldByteLength: 256,
});

c.pushMetric('multiObjectDelete', '3d534b1511e5630e68f0', {
    bucket: 'demo',
    byteLength: 1024,
    numberOfObjects: 999,
});
```

If an error occurs during a `pushMetric` call and the client is unable to record
metrics in the underlying datastore, metric data is instead stored in a local
Redis cache. Utapi attempts to push these cached metrics (every five minutes, by
default) using a component named UtapiReplay. If the `pushMetric` call initiated
by UtapiReplay fails, the metric is reinserted into the local Redis cache. The
particularities of this behavior are configurable. For further information, see
[design](/DESIGN.md).

## Listing Metrics with Utapi

To make a successful request to Utapi you would need

 1. [IAM user with a policy giving access to Utapi](#iam-user-with-a-policy-giving-access-to-utapi)
 2. [Sign request with Auth V4](#signing-request-with-auth-v4)

### IAM user with a policy giving access to Utapi

Note: The examples here use AWS CLI but any AWS SDK is capable of these actions.

**endpoint-url:** This would be `https://<host>:<port>` where your Identity(IAM)
Server is running.

1. Create an IAM user

    ```
    aws iam --endpoint-url <endpoint> create-user --user-name utapiuser
    ```

2. Create access key for the user

    ```
    aws iam --endpoint-url <endpoint> create-access-key --user-name utapiuser
    ```

3. Define a managed IAM policy

    sample utapi policy

    ```json
    cat - > utapipolicy.json <<EOF
    {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Sid": "utapiMetrics",
                "Action": [ "utapi:ListMetrics" ],
                "Effect": "Allow",
                "Resource": [
                    "arn:scality:utapi::012345678901:buckets/*",
                    "arn:scality:utapi::012345678901:accounts/*",
                    "arn:scality:utapi::012345678901:users/*",
                ]
            }
        ]
    }
    EOF
    ```

    In the above sample, the `Resource` property includes a series of Amazon
    Resource Names (ARNs) used to define which resources the policy applies to.
    Thus the sample policy applies to a user with an account ID '012345678901',
    and grants access to metrics at the levels 'buckets', 'accounts', and
    'users'.

    The account ID of the ARN can also be omitted, allowing any account to
    access metrics for those resources. As an example, we can extend the above
    sample policy to allow any account to access metrics at the level 'service':

    ```json
    ...
    "Resource": [
        "arn:scality:utapi::012345678901:buckets/*",
        "arn:scality:utapi::012345678901:accounts/*",
        "arn:scality:utapi::012345678901:users/*",
        "arn:scality:utapi:::service/*",
    ]
    ...
    ```

    The omission of a metric level denies a user access to all resources at that
    level. For example, we can allow access to metrics only at the level
    'buckets':

    ```json
    ...
    "Resource": ["arn:scality:utapi::012345678901:buckets/*"]
    ...
    ```

    Further, access may be limited to specific resources within a metric level.
    For example, we can allow access to metrics only for a bucket  'foo':

    ```json
    ...
    "Resource": ["arn:scality:utapi::012345678901:buckets/foo"]
    ...
    ```

    Or allow access to metrics for the bucket 'foo' for any user:

    ```json
    ...
    "Resource": ["arn:scality:utapi:::buckets/foo"]
    ...
    ```

4. Create a managed IAM policy

    Once your IAM policy is defined, create the policy using the following
    command.

    ```
    aws iam --endpoint-url <endpoint> create-policy --policy-name utapipolicy \
     --policy-document file://utapipolicy.json
    ```

    A sample output of the above command would look like

    ```json
    {
        "Policy": {
            "PolicyName": "utapipolicy",
            "CreateDate": "2017-06-01T19:31:18.620Z",
            "AttachmentCount": 0,
            "IsAttachable": true,
            "PolicyId": "ZXR6A36LTYANPAI7NJ5UV",
            "DefaultVersionId": "v1",
            "Path": "/",
            "Arn": "arn:aws:iam::0123456789012:policy/utapipolicy",
            "UpdateDate": "2017-06-01T19:31:18.620Z"
        }
    }
    ```

    The arn property of the response, which we call `<policy arn>`, will be used
    in the next step to attach the policy to the user.

5. Attach user to the managed policy

    ```
    aws --endpoint-url <endpoint> iam  attach-user-policy --user-name utapiuser
    --policy-arn <policy arn>
    ```

Now the user `utapiuser` has access to ListMetrics request in Utapi on all
buckets.

### Signing request with Auth V4

There are two options here.

You can generate V4 signature using AWS SDKs or the node module aws4. See the
following urls for reference.

* http://docs.aws.amazon.com/general/latest/gr/sigv4_signing.html
* http://docs.aws.amazon.com/general/latest/gr/sigv4-signed-request-examples.html
* https://github.com/mhart/aws4

You may also view examples making a request with Auth V4 using various languages
and AWS SDKs [here](/examples).

Alternatively, you can use a nifty command line tool available in Scality's S3.

You can git clone S3 repo from here https://github.com/scality/S3.git and follow
the instructions in README to install the dependencies.

If you have S3 running inside a docker container you can docker exec into the S3
container as

```
docker exec -it <container id> bash
```

and then run the command

```
node bin/list_metrics
```

It will generate the following output listing available options.

```
Usage: list_metrics [options]

  Options:

    -h, --help                    output usage information
    -V, --version                 output the version number
    -a, --access-key <accessKey>  Access key id
    -k, --secret-key <secretKey>  Secret access key
    -m, --metric <metric>         Metric type
    --buckets <buckets>           Name of bucket(s) with a comma separator if
                                  more than one
    --accounts <accounts>         Account ID(s) with a comma separator if more
                                  than one
    --users <users>               User ID(s) with a comma separator if more than
                                  one
    --service <service>           Name of service
    -s, --start <start>           Start of time range
    -r, --recent                  List metrics including the previous and
                                  current 15 minute interval
    -e --end <end>                End of time range
    -h, --host <host>             Host of the server
    -p, --port <port>             Port of the server
    --ssl                         Enable ssl
    -v, --verbose
```

A typical call to list metrics for a bucket `demo` to Utapi in a https enabled
deployment would be

```
node bin/list_metrics --metric buckets --buckets demo --start 1476231300000
--end 1476233099999 -a myAccessKey -k mySecretKey -h 127.0.0.1 -p 8100 --ssl
```

Both start and end times are time expressed as UNIX epoch timestamps **expressed
in milliseconds**.

Keep in mind, since Utapi metrics are normalized to the nearest 15 min.
interval, so start time and end time need to be in specific format as follows.

#### Start time

Start time needs to be normalized to the nearest 15 minute interval with seconds
and milliseconds set to 0. So valid start timestamps would look something like
`09:00:00:000`, `09:15:00:000`, `09:30:00:000` and `09:45:00:000`.

For example

Date: Tue Oct 11 2016 17:35:25 GMT-0700 (PDT)

Unix timestamp (milliseconds): 1476232525320

Here's a typical JS method to get start timestamp

```javascript
function getStartTimestamp(t) {
    const time = new Date(t);
    const minutes = time.getMinutes();
    const timestamp = time.setMinutes((minutes - minutes % 15), 0, 0);
    return timestamp;
}
```

This would format the start time timestamp to `1476231300000`

#### End time

End time needs to be normalized to the nearest 15 minute end interval with
seconds and milliseconds set to 59 and 999 respectively. So valid end timestamps
would look something like `09:14:59:999`, `09:29:59:999`, `09:44:59:999` and
`09:59:59:999`.

Here's a typical JS method to get end timestamp

```javascript
function getEndTimestamp(t) {
    const time = new Date(t);
    const minutes = time.getMinutes();
    const timestamp = time.setMinutes((minutes - minutes % 15) + 15, 0, -1);
    return timestamp;
}
```

This would format the end time timestamp to `1476233099999`

## Guidelines

Please read our coding and workflow guidelines at
[scality/Guidelines](https://github.com/scality/Guidelines).

### Contributing

In order to contribute, please follow the
[Contributing Guidelines](
https://github.com/scality/Guidelines/blob/master/CONTRIBUTING.md).

[badgepub]: http://circleci.com/gh/scality/utapi.svg?style=svg
[badgepriv]: http://ci.ironmann.io/gh/scality/utapi.svg?style=svg
