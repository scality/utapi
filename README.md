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
import { UtapiClient } from 'utapi';

const config = {
    redis: {
        host: '127.0.0.1',
        port: 6379
    }
}
const c = new UtapiClient(config);

// The second argument to `PushMetric` is a hexadecimal string Request Unique
// Identifier used for logging.
c.pushMetric('createBucket', '3d534b1511e5630e68f0', { bucket: 'demo' });

c.pushMetric('putObject', '3d534b1511e5630e68f0', {
    bucket: 'demo',
    newByteLength: 1024,
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

## Guidelines

Please read our coding and workflow guidelines at
[scality/Guidelines](https://github.com/scality/Guidelines).

### Contributing

In order to contribute, please follow the
[Contributing Guidelines](
https://github.com/scality/Guidelines/blob/master/CONTRIBUTING.md).

[badgepub]: http://circleci.com/gh/scality/utapi.svg?style=svg
[badgepriv]: http://ci.ironmann.io/gh/scality/utapi.svg?style=svg
