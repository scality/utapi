# Quickstart

## Server

### Using Docker (~5 minutes)

1. Build the image:
```
$ docker build --tag utapi .
Sending build context to Docker daemon  10.79MB
Step 1/7 : FROM node:8-slim
 ---> bce75035da07
...
Successfully built 5699ea8e7dec
```

2. Run the image:
```
$ docker run --publish 8100:8100 --detach utapi
25fea1a990b18e7f1f6c76cc5d0c5d564fd6bffb87e1acf5f724db16d602a5b5
```

You should now have a Utapi server running at port 8100.

### Using NPM (~1 minute)

```
$ npm start
> utapi@8.0.0 start /Users/bennettbuchanan/repos/scality/utapi
> node start-server.js

{"name":"Utapi","time":1562008743439,"id":0,"childPid":55156,"level":"info","message":"Worker started","hostname":"Bennetts-MacBook-Pro-2.local","pid":55155}
{"name":"Utapi","time":1562008743474,"id":5,"childPid":55161,"level":"info","message":"Worker started","hostname":"Bennetts-MacBook-Pro-2.local","pid":55155}
{"name":"Utapi","time":1562008743493,"id":2,"childPid":55158,"level":"info","message":"Worker started","hostname":"Bennetts-MacBook-Pro-2.local","pid":55155}
{"name":"Utapi","time":1562008743495,"id":1,"childPid":55157,"level":"info","message":"Worker started","hostname":"Bennetts-MacBook-Pro-2.local","pid":55155}
{"name":"Utapi","time":1562008743556,"id":4,"childPid":55160,"level":"info","message":"Worker started","hostname":"Bennetts-MacBook-Pro-2.local","pid":55155}
{"name":"Utapi","time":1562008743575,"id":3,"childPid":55159,"level":"info","message":"Worker started","hostname":"Bennetts-MacBook-Pro-2.local","pid":55155}
{"name":"Utapi","time":1562008743582,"id":7,"childPid":55163,"level":"info","message":"Worker started","hostname":"Bennetts-MacBook-Pro-2.local","pid":55155}
{"name":"Utapi","time":1562008743606,"id":9,"childPid":55165,"level":"info","message":"Worker started","hostname":"Bennetts-MacBook-Pro-2.local","pid":55155}
{"name":"Utapi","time":1562008743619,"id":6,"childPid":55162,"level":"info","message":"Worker started","hostname":"Bennetts-MacBook-Pro-2.local","pid":55155}
{"name":"Utapi","time":1562008743639,"id":8,"childPid":55164,"level":"info","message":"Worker started","hostname":"Bennetts-MacBook-Pro-2.local","pid":55155}
```

## Client

See examples in examples/

```js
const http = require('http');

const bucketName = 'test-bucket';

// Get the start and end times for a range of one month.
const start = new Date(2016, 1, 1, 0, 0, 0, 0).getTime();
const end = new Date(2016, 2, 1, 0, 0, 0, 0).getTime() - 1;
const requestBody = JSON.stringify({
    buckets: [bucketName],
    timeRange: [start, end],
});
const header = {
    host: 'localhost',
    port: 8100,
    method: 'POST',
    service: 's3',
    path: '/buckets?Action=ListMetrics',
    signQuery: false,
    body: requestBody,
};
const request = http.request(header, response => {
    const body = [];
    response.on('data', chunk => body.push(chunk));
    response.on('end', () => {
        console.log(JSON.parse(body.join('')));
    });
});
request.on('error', e => process.stdout.write(`error: ${e.message}\n`));
request.write(requestBody);
request.end();
```