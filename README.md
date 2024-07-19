# The invariant project

## Storage API

This is a server for the storage API of the Invariant project. The API is a set of HTML Requests.

Server specific authorization my be required for any of the requests.

## GET /blob/sha256/:hashCode

Retrieve an octent stream of the data with hash code `:hashCode`, if it is in
the store. 

### Required response headers

| Header        | Value                     |
| ------------- | ------------------------- |
| Content-Type  | application/octent-stream |
| cache-control | immutable                 |
| ETag          | `:hashCode`               |

All other headers are as defined by HTML 1.1

## HEAD /blob/sha256/:hashCode

Retrieve information about whether a blob is available.

### Required response headers

| Header         | Value                     |
| -------------- | ------------------------- |
| Content-Type   | application/octent-stream |
| ETag           | `:hashCode`               |
| content-length | `:size`                   |

## POST /blob/sha256/

Store a blob into the store. The server, if it accepts a blob, is required to support up to 1 Mib of data per blob. It may store larger blobs but this should not be relied on.

### Required response headers

| Header         | Value                     |
| -------------- | ------------------------- |
| Content-Type   | plain/text                |

The body of the response is the URL path part of the content.

## PUT /blob/sha256/:hashCode

Store a blob into the store with the given hash code.

This is similar to POST but the `:hashCode` must match the sha256 hash hash of the uploaded content.

If content with the given `:hashCode` is already present in the store the server may disconnect.

### Required response headers

| Header         | Value                     |
| -------------- | ------------------------- |
| Content-Type   | plain/text                |

The body of the response is the URL path part of the content.
