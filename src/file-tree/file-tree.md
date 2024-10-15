# File tree

A file tree is a directory of files and other directories that form a tree. Each file reference is a ``:content-link:`.

# Values

## `:content-link:`

A `:content-link:` is a link to the content address in a storage server or a link to a slot address that then refers to a content address.

```ts
interface ContentLink {
    address: string
    slot?: boolean
    key?: string
    algorithm?: string
    salt?: string
    blockTree?: boolean
    offset?: number
    length?: number
    primary?: string
}
```

```ts
interface Block {
    content: ContentLink
    size: number
}

type BlockTree = Block[]
```

### `address`

The `address` is the content address in a block storage or the slot address if this is a slot reference.

### `slot`

If `true`, `address` is the `:id:` of the slot that contains that actual content address.

## `key`

The key to use to decrypt the data referenced by `address`. This key is for the entire content linked unless
overriden by a block list that contains a different content link.

## `algorithm`

The encryption algorithm that was used to encrypt the content. The algorithim should be a commonly implemented encryption algorithm such as those supported by open ssl.

## `salt`

The salt used during encryption of the file.

## `blockTree`

If `true`, the content refers to a array of blocks split arbitrarily by the tree producer.

## `offset`

A optional offset into the content. If not specified the default is 0.

## `length`

The length of the block. The default is the rest of the content after `offset`.

## `primary`

The primary block store for the linked content. Is the considered the primary source of the content. However, this should only be used if a finder cannot otherwise find it as it is more likely a findeer will find a geographically closer location for the content.

# `:entries`

A stream of directory entires. This can either be a JSON array of entires or white-space or comma separated entries.

# `:entry:`

An entry is a directory entry that either refers to a `:file-entry:` or `:directory-entry:`.

```ts
enum EntryKind {
    File = "File",
    Directory = "Directory",
}

interface BaseEntry {
    kind: EntryKind
    name: string
    content: ContentLink
    createTime?: number
    modifyTime?: number
}

type Entry = FileEntry | DirectoryEntry
```

All entries share the following values:

## `kind`

The kind of the entry, either a file entry or a directory entry.

## `name`

The name of the file. The file tree does not give special names or otherwise restrict the value of a name nor is the name validated. However, the `name` should be restricted to using characters that are commonly supported to avoid compatibilty issues when a file tree is mapped to a operating system using a FUSE or a network file system.

## `content`

The link to the content associated with this entry.

## `createTime`

The number of milliseconds from Midight, Jan 1, 1970 the file was first created.

## `modifyTime`

The number of milliseconds from Midnight, Jan 1, 1970 the file was last modified.

# `:directory-entry:`

A directory entry is reference to an `:entries:` stream.

```ts
interface DirectoryEntry extends BaseEntry {
    kind: EntryKind.Directory
}
```

# `:file-entry:`

A file entry is a reference to a file content.

```ts
interface FileEntry extends BaseEntry {
    kind: EntryKind.File
    size?: number
    type?: string
    mode?: string
}
```

## `size`

The size of the entry. It is recommended that size be included if `content` is not a slot reference a file system mapping is more efficient if this is included.

## `type`

This is the content type which should be an HTTP content type. This value is use

## `mode`

This is a mode to use when mapped to a file system or if the file tree is copied to a file system. The mode is otherwise ignored. The mode should `r`, `w`, or `x` or some combination of them. If the mapping is a read only mapping, `w` is ignored. If no `mode` is specified it defaults to `rw` (unless it is a read-only mapping which defaults to `r`). The mode is just `x`, it is assume to be `rwx`.

