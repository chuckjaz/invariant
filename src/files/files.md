# Invariate files

A files server uses invariant servers to implement a posix style file system that can be to read and create file directories.

# Values

## `:content-kind`

Specifies what content a node represents. It is is either `"Directory"` or `"File"`.

## `:content-info`

Content info is a JSON object that has the TypeScript type.

```ts
interface ContentInformation {
    node: Node
    kind: ContentKind
    modifyTime: number
    createTime: number
    executable: boolean
    writable: boolean
    etag: string
    size?: number
    type?: string
}
```

## `:content-link`

A content link description as defined by a file tree.

## `:directory-entry`

A directory entry is a `:content-info` with a `name` string.

```ts
interface FileDirectoryEntry{
    name: string
    node: number
}
```

## `:name`

A string which is the name of a file.

## `:node`

The node ID number.

# `POST /files/mount`

Mount a content link to the files server. Once the content link is a mounted the file becomes accessable from the other methods. If the content-link is slot reference then the directory is writable; ohterwise the directory and all its content are read-only. Changing a mounted slot will cause a change request to the associated slot.

## Request

The request is a `:content-link`.

## Response

The response is a `:node`

# `POST /files/unmount/:node`

Unmount `:node`.

## Response

The response is a `:content-link`.

# `GET /files/lookup/:node/:name`

Lookup `:name` in the directory `:node`

## Response

The response is status 200 and `:node` or 404 if the name is not found

# `GET /files/info/:node`

Retrieve information about a `:node`.

## Response

The response is `:content-info`.

# `POST /files/:node/:name`

Create a new file or directory in the `:node`. `:node` must refer to a directory.

### Headers

#### `Content-Type`

If specified, nade the `kind` is `"File"`, the content type is recorded in the `:node` directory.

### Query parameters

#### `executable=:boolean`

Sets if the file or directory is executable. If unspecified it defaults to `false`.

#### `kind=:content-kind`

If unspecified, `"File"` is assumed.

#### `writeable=:boolean`

Sets if the file or directory is writable. If unspecified it defaults to `true`.

## Request

For content kind of `"File"` the request are the initial content of the file.

For a `"Directory"`, no content is expected any any supplied is ignored.

## Response

The response is a `:node`

# `GET /files/:node`

## Response

The content of a file or directory. If the node is a directory the response is a sequence of `:directory-entry` JSON objects. If `:node` is a file, the the response is bytes of the file.

### Query Parameters

#### `offset=:number`

Offset into the file or directory to start; if it is not specified it starts the beginning of the file. If the node is a directory the offset and length refer to directory entries not bytes.

#### `length=:number`

The length of the response. If `length` is not secified then the length is the rest of the file or directory. If the node is a file the length is in bytes. For directories it is the number of entries.

# `PUT /files/:node`

## Request

Write bytes to the file. If the node is a directory this results in an error.

### Headers

#### `Content-Type`

If specified the content type is recorded in the directory.

### Query Parameters

#### `executable=:boolean`

Sets if the file or directory is executable.

#### `offset=:number`

If offset is specified the write starts at the `offset` bytes into the file.

#### `size=:number`

If specified the size will be at least `size` bytes. If the `size` is less than the size of the file then the file is truncated to the size. If the `size` is larger than the size of the file the size is zero filled to `size`. After the file is made `size` long, the rest of the write operation is performed. To just set the size, include the `size` query paraemter but no content in the request.

#### `writeable=:boolean`

Sets if the file or directory is writable.
