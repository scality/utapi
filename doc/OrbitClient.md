# Zenko Metrics Client (ZTAPI)

## Description

This feature allows storing and retrieving CloudServer data with a global
counter.

## Requirements

* Enable multiple instances of CloudServer to incrementally update a single
  global counter for statistic reporting to Zenko.

* Allow CloudServer manager instance to retrieve the global counter values.

## Design

Utapi will expose a client which accepts the properties and values for updating
a Redis hash key.

## Redis Hash Key

Redis will store relevant data in a Redis hash key following the Utapi Redis key
naming schema:

```
zenko:service::itemCounts
```

The hash will include the following key and values:

```
{
    timestamp: int,
    versions: int,
    objects: int,
    prev: int,
    curr: int,
    location:<location-name>:prev: int,
    location:<location-name>:curr: int,
}
```

Hash key descriptions:

* `timestamp`: The unix timestamp of the latest update to the values
* `versions`: The number of versions being stored by Zenko
* `objects`: The number of objects being stored by Zenko
* `prev`: The number of bytes being stored across versions by Zenko
* `curr`: The number of bytes being stored across objects by Zenko
* `location:<location-name>:prev`: The number of bytes stored by versions at the
  given lovation
* `location:<location-name>:curr`: The number of bytes stored by objects at the
  given lovation

When metrics are being updated, we use the Redis `HINCRBY` command to increment
the values.

## Definition of API

* List Total Data Managed client response:

    This GET request retrieves a listing of the total count of versions and
    objects, the total data managed (in bytes) for all versions (i.e., previous)
    and objects (i.e., current), and for each storage location.

    Response:

    ```sh
    {
        versions: 0,
        objects: 0,
        dataManaged: {
            total: {
                previous: 0,
                current: 0
            }
            byLocations: {
                <location-name>: {
                    previous: 0,
                    current: 0
                },
                [...]
            }
        }
    }
    ```

## Dependencies

* Redis-HA

## Operational Considerations

* Perform a full scan when first starting up the CloudServer for setting the
  initial hash key.

* We need custom tooling that allows a user to enable periodic updates using
  Mongo client's full scan in the case that the metrics get out of sync. When
  using this tool, after the full scan completes we need to account for the
  delta between the current status of the key and the full scan.

* The global values will be updated at the CloudServer API level:

  ```
  versions: int,
  objects: int,
  prev: int,
  curr: int,
  ```

* The location-specific values will be updated in the CloudServer's route
  backbeat for CRR, or if the location-constraint for the bucket includes that
  location.

## Rejected Options

* Using a Redis key data type was rejected because we would need to store the
  data as a string. This would mean we need to first get the value, parse it,
  update the values, stringify and then put the value again to Redis. There are
  less steps involved if we instead use a Redis hash and increment the key
  values.

* Using a timestamp in the Redis key. There is no need to currently include
  the timestamp in the Redis key schema since there will be a single global key
  counter.

* Bucket level information is not included in the response because Mongo Client
  continues to update.