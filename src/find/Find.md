# The invariant project - Find protocol

A find server must implement the find. The protocol is a set of HTML Requests.

A find server allows finding an id container for an id. Example id containers include storage servers that may contain the blob with `:id` and broker servers that may contain information about a server with `:id`.

# Values

# `:id`

A server ID which is a 32 byte hex encoded value.

# GET `/id/`

Determine the `:id` of the server.

# GET `/find/:id`

Find a server that knows about `:id`.

Find returns a plain text response with the prefix HAS or CLOSER a space `:id` follwed by a line-feed. Plain text is used instead of JSON to allow response to be partially read. That is, the client can stop reading and close the conntection if the information has the information it needs.

### HAS

A has response indicates that the container with `:id` has the `:id` in the request.

```
HAS :id
```

### CLOSER

```
CLOSER :id
```

A `CLOSER` indicating that the find server with `:id` may have better information about `:id`.

# PUT '/find/has/

Notify the find server that a container has the following items.

The request has the TypeScript type of

```
interface FindHasRequest {
    container: string
    items: string[]
}
```

# PUT '/find/notify/

Notify the find server the presence of another find server.

The request has the TypeScript type of

```
interface FindNotifyRequest {
    find: string
}
```

# Closer

A find server is "closer" to the blob given a Kademlia definition of closer.

# Implementation notes

Finding an id should return with a best effort by the server to determine its location. Once an unknown id has been requested the server should , in parallel, make an effort to local the id among the find servers it knows that are closer to the id well as any find servers that are futher than it is from the server or id. It is up to the client to poll the find server perodically to determine if the server has more up-to-date information about the id. The server is free to place a limit over the interval and frequency such requests are allowed.

If the previously id is found the server, in parallel, should register the id (or storage the blob is in) with the find servers that are closer to the blob that it is if it is unknown if the server knows about the storage server or if it has been longer than 30 minutes since the last time the find server has been notified about the storage.

Once a response is returned the server, in parallel, should validate that all the find servers are still functioning and that all the storage servers have the blob. It should unregister any servers that have not responded within the last 30 minuts and remove any HAS information for storage servers that no longer report as having the blob.
