package main

import (
    "fmt"
    "time"
    "bytes"
    "encoding/json"
    "net/http"
    "io/ioutil"
    "github.com/aws/aws-sdk-go/aws/credentials"
    "github.com/aws/aws-sdk-go/aws/signer/v4"
)

func main() {
    // Input AWS access key, secret key, and session token.
    aws_access_key_id := "EO4FRH6BA2L7FCK0EKVT"
    aws_secret_access_key := "B5QSoChhLVwKzZG1w2fXO0FE2tMg4imAIiV47YWX"
    token := ""
    bucket_name := "test-bucket"
    // Get the start and end times for a range of one month.
    start_time := time.Date(2016, 1, 1, 0, 0, 0, 0, time.UTC)
    end_time := time.Date(2016, 2, 1, 0, 0, 0, 0, time.UTC)
    // Get the UNIX epoch timestamps expressed in milliseconds.
    start_timestamp := start_time.UnixNano() / int64(time.Millisecond)
    end_timestamp := ((end_time.UnixNano() / int64(time.Millisecond)) -
        ((end_time.UnixNano() / int64(time.Millisecond)) % 900000)) - 1
    type BucketMetricRequest struct {
        Buckets []string `json:"buckets"`
        TimeRange [2]int64 `json:"timeRange"`
    }
    bucketMetricRequest := BucketMetricRequest{
        Buckets:   []string{bucket_name},
        TimeRange: [2]int64{start_timestamp, end_timestamp},
    }
    buf := bytes.NewBuffer([]byte{})
    enc := json.NewEncoder(buf)
    enc.Encode(&bucketMetricRequest)
    request, err := http.NewRequest("POST",
        fmt.Sprintf("%s/buckets?Action=ListMetrics", "http://localhost:8100"),
        buf)
    if err != nil {
        panic(err)
    }
    reader := bytes.NewReader(buf.Bytes())
    credentials := credentials.NewStaticCredentials(aws_access_key_id,
        aws_secret_access_key, token)
    signer := v4.NewSigner(credentials)
    signer.Sign(request, reader, "s3", "us-east-1", time.Now())
    client := &http.Client{}
    resp, err := client.Do(request)
    if err != nil {
        panic(err)
    }
    defer resp.Body.Close()
    body, err := ioutil.ReadAll(resp.Body)
    if err != nil {
        panic(err)
    }
    fmt.Println(string(body))
}
