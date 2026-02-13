# Distribute - block distributor

The job of distribute is to ensure that data blocks are distributed among storage servers to reduce the chance that one of the storage servers becoming unavailable will make the block unavailable.

The primary algorithm used by distribute is to determine Kademlia distance of the block from the storage server and to take the top N servers, where N is by default 3, and ensure these servers have the block. If they don't have the block, the server is first sent a `PUT /storage/fetch` request and, if that fails, the block is read from a server that has the block and sent the block using `PUT /storage/:id`.

The distributor manages a set of storage servers that it distributes blocks to. They are periodically checked to ensure they contain the block they are requested to contain. When a storage is registered it is queried for all the blocks it contains and those are then distributed among the other registered storage servers.

If the storage server becomes unresponsive the blocks it contains are considered lost and the blocks it was holding are redistributed between the remaining storage servers. If a storage server is unregistered, it is considered unresponsive and its blocks are redistributed.

Registered, unresponsive storage servers are periodically polled to see if they have come back and the storage server will be treated as if it is a new storage server. The blocks are redistributed among the storage servers and then checked if the storage server has the block already, uploading any missing blocks.

# `PUT /distribute/has/:id`

Notify the distribute server that a storage server has the following blocks.

The request has the TypeScript type of

```ts
interface FindHasRequest {
    container: string
    items: string[]
}
```

This matches the notification used by find servers.

# `GET /distribute/needed?storage=:id&block=:id`

Determine if the a block is relied on to be to be stored by the given storage server. This can be used by a storage server to determine if the distributor is relying on it to store a block. This request returns either `true` or `false` as the body of the response. If the block or server is unknown 404 is returned. Storage servers SHOULD conservatively interpret a 404, or other error, response as the block SHOULD be retained as the distributor may be still be collecting known blocks from all the storage server, or may have been delayed in receiving the has notification, and may not have know the block yet.

# `PUT /distribute/register/storage/:id`

Requests a set of storage servers be added to the distributor. If a storage is registered multiple times the redundant registrations are ignored.

When a storage is registered, it will send a `PUT /storage/distribute/:id` request to the storage servers where `:id` is the distribute server's `:id`. If the storage server responds with status 200 then the storage server is considered registered. The storage server is expected to notify the distribute service of any new blocks it receives as well as optionally respond to a `GET /storage/blocks` request.

When a storage server is registered the distribute server will lazily the server, using a `GET /storage/blocks` request, to determine which blocks it contains. The blocks `:id`s returned by this request are then distributed among the currently registered storages.

# `PUT /distribute/unregister/storage/:id`

Request a set of storage be unregistered. When a storage is unregistered the blocks it used to have are scheduled to be redistributed.

