import { ContentLink } from "../common/types"
import { Data } from "../storage/client"

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
    node: number
}

export interface FileLayerClient {
    mount(content: ContentLink, executable?: boolean, writable?: boolean): Promise<Node>
    unmount(node: Node): Promise<ContentLink>

    lookup(parent: Node, name: string): Promise<Node | undefined>
    info(node: Node): Promise<ContentInformation | undefined>
    content(node: Node): Promise<ContentLink>

    createNode(parent: Node, name: string, kind: ContentKind.File, executable?: boolean, writable?: boolean, type?: string | null, data?: Data, size?: number): Promise<Node>
    createNode(parent: Node, name: string, kind: ContentKind.Directory, executable?: boolean, writable?: boolean): Promise<Node>
    readFile(node: Node, offset?: number, length?: number): Data
    writeFile(node: Node, data: Data, offset?: number, size?: number, executable?: boolean, writable?: boolean, type?: string | null): Promise<number>
    readDirectory(node: Node, offset?: number, length?: number): AsyncIterable<FileDirectoryEntry>
    remove(parent: Node, name: string): Promise<boolean>
}
