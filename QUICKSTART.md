# Quickstart

## Server

Starting the Utapi server can be done in two ways:
[using NPM](#using-npm-2-minutes) or
[using Docker](#using-docker-5-minutes). Either method will start a server
locally, listening on port 8100.

### Using NPM (~2 minutes)

Please use node v10.16.0 (npm v6.9.0).

1. Install dependencies:

    ```
    npm install
    ```

2. Start the server:

    ```
    $ npm start
    utapi@8.0.0 start /Users/repos/scality/utapi
    node start-server.js
    {"name":"Utapi","time":1562008743439,"id":0,"childPid":55156,"level":"info",
    "message":"Worker started","hostname":"MacBook-Pro-2.local", "pid":55155}
    ...
    ```

### Using Docker (~5 minutes)

1. Build the image:

    ```
    $ docker build --tag utapi .
    Sending build context to Docker daemon  10.79MB
    Step 1/7 : FROM node:10-slim
    ---> bce75035da07
    ...
    Successfully built 5699ea8e7dec
    ```

2. Run the image:

    ```
    $ docker run --publish 8100:8100 --detach utapi
    25fea1a990b18e7f1f6c76cc5d0c5d564fd6bffb87e1acf5f724db16d602a5b5
    ```