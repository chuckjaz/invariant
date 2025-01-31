# The invariant names server

The names server protocol is a protocol to map names to an content link address. The local implementation uses a file similar to a Unix host file, though stored in JSON. The intent for the names server is to use TXT records of DNS. The interface definition in this directory services as a abstraction for the server that allows for a local, bootstrap, implementation as well as allows mocking the names server.

The format for names is DNS syntax such as "invariant.removingalldoubt.dev" which, for example, would be the root file system for the invariant project. If no domain is specified, such as "invariant", then "local" is assumed which is assumed to be either resolved by DNS as "invariant.local" or provided by a name service registered by in the broker.
