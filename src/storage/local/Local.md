# Local storage

A server that can be run locally that implements the storage API.

The server uses the local file system under the the `sha256` of the directory the app.js file is located. It also uses a `tmp` directory in the same location to store files in the process of being uploaded.