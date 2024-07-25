# The invariant project - Find protocol

A find server must implement the find. The protocol is a set of HTML Requests.

A find server allows finding the storage server of a blob using a hash of the content of the blob.

# Values

## `:hashId` 

The content hash of the content which is of the from &lt;`algorithm`&gt;`/`&lt;`hashCode`&gt;.

# `:id`

A server ID which is a 32 byte hex encoded value.

# GET `/id/`

Determine the `:id` of the server.

# GET `/find/sha256/:hashId`

Find the blob with the given `:hashId`.

The response is a `text/plan` `\n` delimited text that contains one line per entry which is either a `HAS` entry or a `CLOSER` entry.

## `HAS :id`

A entry indicating that the server with `:id` may of the blob.

## `CLOSER :id`

A entry indicating that the find server with `:id` may have better information about this blob. This find server is "closer" to the blob given a Kademlia definition of closer.

Requesting a blob will immedately return with the best effort by the server to determine its location. Once an unknown blob has been requested the server, in parallel, should make an effort to local the blob among the storage servers knows as well as any find servers that are futher than it is from the blob. It is up to the client to poll the find server perodically to determine if the server has more up-to-date information about the blob. The server is free to place a limit over the interval and frequency such requests are allowed.

If the previously unknown blob is found in a registered storage the server, in parallel, should register the storage server with the find servers that are closer to the blob that it is if it is unknown if the server knows about the storage server or if it has been longer than 30 minutes since the last time the find server has been notified about the storage.

Once a response is returned the server, in parallel, should validate that all the find servers are still functioning and that all the storage servers have the blob. It should unregister any servers that have not responded within the last 30 minuts and remove any HAS information for storage servers that no longer report as having the blob.
