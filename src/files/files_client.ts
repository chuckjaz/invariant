import { ContentLink } from "../common/types"
import { Data } from "../storage/storage_client"

export type Node = number

export enum ContentKind {
    File = "File",
    Directory = "Directory",
}

export interface ContentInformation {
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

export interface FileDirectoryEntry {
    name: string
    kind: ContentKind
    node: number
}

export interface EntryAttributes {
    executable?: boolean
    writable?: boolean
    modifyTime?: number
    createTime?: number
    type?: string | null
}

export interface FilesClient {
    ping(): Promise<string | undefined>

    mount(content: ContentLink): Promise<Node>
    unmount(node: Node): Promise<ContentLink>

    lookup(parent: Node, name: string): Promise<Node | undefined>
    info(node: Node): Promise<ContentInformation | undefined>
    content(node: Node): Promise<ContentLink>

    readFile(node: Node, offset?: number, length?: number): Data
    writeFile(node: Node, data: Data, offset?: number, length?: number): Promise<number>
    setSize(node: Node, size: number): Promise<void>

    readDirectory(node: Node, offset?: number, length?: number): AsyncIterable<FileDirectoryEntry>
    createNode(parent: Node, name: string, kind: ContentKind): Promise<Node>
    removeNode(parent: Node, name: string): Promise<boolean>
    setAttributes(node: Node, attributes: EntryAttributes): Promise<void>
    rename(parent: Node, name: string,  newParent: Node, newName: string): Promise<boolean>
    link(parent: Node, node: Node, name: string): Promise<boolean>

    sync(): Promise<void>
}

export interface ContentReader {
    readContentLink(content: ContentLink): Data
}

export interface ContentWriter {
    writeContentLink(data: Data): Promise<ContentLink>
}