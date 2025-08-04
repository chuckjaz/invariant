# Invariant files

A files server uses invariant servers to implement a posix style file system that can be to read and create file directories.

# Values

## `:content-kind`

Specifies what content a node represents. It is is either `"Directory"`, `"File"`, or `"SymbolicLInk"`.

## `:content-info`

Content info is a JSON object that has the TypeScript type.

```ts
enum ContentKind {
    File = "File",
    Directory = "Directory",
    SymbolicLink = "SymbolicLink"
}

interface ContentInformationCommon {
    node: Node
    kind: ContentKind
    modifyTime: number
    createTime: number
    executable: boolean
    writable: boolean
    etag: string
}

interface FileContentInformation extends ContentInformationCommon {
    kind: ContentKind.File
    size: number
    type?: string
}

interface DirectoryContentInformation extends ContentInformationCommon {
    kind: ContentKind.Directory
    size: number
}

interface SymbolicLinkContentInformation extends ContentInformationCommon {
    kind: ContentKind.SymbolicLink
    target: string
}

type ContentInformation = FileContentInformation | DirectoryContentInformation |
    SymbolicLinkContentInformation
```

## `:content-link`

A content link description as defined by a file tree.

## `:directory-entry`

A directory entry is a `:content-info` with a `name` string.

```ts
interface FileDirectoryEntry{
    name: string
    info: ContentLink
}
```

## `:entry-attributes`

The attributes of a node that can be changed directly.

```ts
export interface EntryAttributes {
    executable?: boolean
    writable?: boolean
    modifyTime?: number
    createTime?: number
    type?: string | null
}
```

## `:name`

A string which is the name of a file.

## `:node`

The node ID number.

# `GET /files/:node`

## Response

The content of a file or directory. If the node is a directory the response is a sequence of `:directory-entry` JSON objects. If `:node` is a file, the the response is bytes of the file. If the `:node` is a symbolic link, this returns the target of the link.

### Query Parameters

#### `offset=:number`

Offset into the file or directory to start; if it is not specified it starts the beginning of the file. If the node is a directory the offset and length refer to directory entries not bytes.

#### `length=:number`

The length of the response. If `length` is not specified then the length is the rest of the file or directory. If the node is a file the length is in bytes. For directories it is the number of entries.

# `PUT /files/:node`

## Request

Write bytes to the file. If the node is a directory or symbolic link this results in an error.

### Headers

#### `Content-Type`

If specified the content type is recorded in the directory.

### Query Parameters

#### `offset=:number`

If offset is specified the write starts at the `offset` bytes into the file.

#### `size=:number`

If specified the size will be at least `size` bytes. If the `size` is less than the size of the file then the file is truncated to the size. If the `size` is larger than the size of the file the size is zero filled to `size`. After the file is made `size` long, the rest of the write operation is performed. To just set the size, include the `size` query parameter but no content in the request.


# `PUT /files/:node/:name`

Create a new file, symbolic link, or directory in the `:node`. `:node` must refer to a directory.

### Query parameters

#### `kind=:content-kind`

If unspecified, `"File"` is assumed. The supported kinds are `"File"`, `"Directory"`, and `"SymbolicLink"`.

#### `content=:content-link`

For `kind` of `"File"` or `"Directory"`, an optional `:content-link` to specify the initial content.

#### `executable=:boolean`

Sets if the file or directory is executable.

#### `target=:string`

For `kind` of `"SymbolicLink"`, the target path for the link. The parameter is required for `"SymbolicLink"` nodes.

#### `writeable=:boolean`

Sets if the file or directory is writable.

## Request

No request body is expected.

## Response

The response is a `:content-info` object for the newly created entry.

# `POST /files/attributes/:node`

Set the attributes of a `:node`.

## Request

The body of of the request is expected to be a `:entry-attributes`.

## Response

The body of the response is the `:content-info` of the updated entry.

# `GET /files/content/:node`

Retrieve a `:content-link` for `:node`.

## Response

The body of the response is a `:content-link` which is `:content-link` to the file or directory. It is an error to request the content link of a symbolic link.

# `GET /files/info/:node`

Retrieve information about a `:node`.

## Response

The response is `:content-info`.

## Response

The response is a `:content-link`

# `PUT /files/link/:node/:name`

Link a node to the given `:name`. The `:name` will not have the same node for the life-time of the file system server. The mapping currently does not survive persistence. That is, the name is only liked to other `:node` for as long as the server is running. If it stopped and restarted the two files will change independently.

### Query parameters

#### `node=:node`

The node to link `:name` to.

# `GET /files/lookup/:node/:name`

Lookup `:name` in the directory `:node`

# `POST /files/mount`

Mount a content link to the files server. Once the content link is a mounted the file becomes accessible from the other methods. If the content-link is slot reference then the directory is writable; otherwise the directory and all its content are read-only. Changing a mounted slot will cause a change request to the associated slot.

## Request

The request is a `:content-link`.

## Response

The response is a `:node`

# `POST /files/remove/:node`

Remove the requested `:node`.

## Response

The response is a `:boolean` which is `true` when the file was removed, or `false` if could not be.

# `PUT /files/rename/:node/:name`

### Query parameters

#### `newParent=:node`

The node of the new parent. If missing the `:node` is from the URL is used as the new `newParent`.

#### `newName=:name`

The new name to give the file.

# `POST /files/unmount/:node`

Unmount `:node`.

## Response

The response is a `:content-link` which is a link to the content of previously mounted file system.

## Response

The response is status 200 and `:content-link` or 404 if the name is not found.

