# Distribute - block distributor

The job of distribute is to ensure that data blocks are distributed among storage servers to reduce the chance that one of the storage servers becoming unavailable will make the block unavailable.

The primary algorithm used by distribute is to determine Kademlia distance of the block from the storage server and to take the top N servers, where N is by default 3, and ensure they have the block. If they don't have the block the block is uploaded to the service.

The blocks to manage is a set of pinned blocks. A pin on a block is requested by requesting a pin all the blocks a content references through a manifest. A manifest is a stream of addresses that should be pinned.

The distributor manages a set of storage servers that it distributes blocks to. They are periodically checked to ensure they contain the block they are requested to contain. If the storage server becomes unresponsive the blocks it contains are considered lost and the blocks it was holding are redistributed between the remaining storage servers. If a storage server is unpinned and there are no remaining pins keeping it pinned, it is considered unresponsive and its blocks are redistributed.

Unresponsive storage servers are periodically polled to see if they have come back and the storage server will be treated as if it is a new storage server. The blocks are redistributed among the storage servers and then checked if the storage server has the block already, uploading any missing blocks.

# `PUT /distribute/pin`

Request a pin on content. The content will be pinned and distributed through the set of known storage servers. By default, a distributor knows all the storage servers registered with its broker, though storage servers can be added explicitly.

A particular block can be pinned by multiple pin requests and the pin requests are reference counted.

If content is requested to pinned must be unpinned the same number of times it is pinned.

```ts
type DistributorPutPinRequest = AsyncIterable<string>
```

# `PUT /distribute/unpin`

Request the content be unpinned.

A particular block can be pinned by multiple pin request. All pin requests that pin the block must be unpinned for a particular block is considered unpinned.

```ts
type DistributorPutUnpinRequest = AsyncIterable<string>
```

# `PUT /distribute/register/storage`

Requests a set of storage servers be added to the distributor. This is like a pin in that the storage servers are references counted and all registrations of the stores must be unpinned for the storage to be unpinned.

```ts
type DistributorPutRegisterStorageRequest = AsyncIterable<string>
```

# `PUT /distirbutor/unregister/storage`

Request a set of storage servers be unpinned.

```ts
type DistributorPutUnregisterStorageRequest = AsyncIterable<string>
```

# `POST /distributor/blocks`

Request information about pinned blocks. This can, for example, be used by storage servers to determine if a block they have can be discarded because as it is already being stored by a sufficient number of other storage servers. A storage server should prioritize blocks that the distributor is relying on it storing.

```ts
type DistributorPostBlocksRequest = AsyncIterable<string>
```

```ts
interface DistributorPostBlocksResponseItem {
    block: string
    storages: string[]
}
```

```ts
type DistributorPostBlocksResponse = AsyncIterable<DistributorPostBlocksResponseItem>
```

# Distributor and file-tree

