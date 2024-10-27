import { Data } from "../storage/client"

export type Node = number

export interface FileLayerClient {
    mountId(id: string): Promise<Node>
    mountSlot(slot: string): Promise<Node>
    unmount(node: Node): Promise<void>

    lookup(parent: Node, name: string): Promise<Node | undefined>
    info(node: Node): Promise<ContentInformation>

    createFile(parent: Node, name: string): Promise<Node>
    readFile(node: Node, offset?: number, size?: number): Data
    writeFile(node: Node, data: Data, offset?: number): Promise<number>
    setAttributes(node: Node, executable: boolean, writable: boolean): Promise<void>
    setSize(node: Node, size: number): Promise<void>
    removeFile(parent: Node, name: string): Promise<void>
    allocateFileSpace(node: Node, offset: number, size: number): Promise<void>

    createDirectory(parent: Node, name: string): Promise<Node>
    readDirectory(node: Node): AsyncIterable<DirectoryEntry>
    removeDiretory(parent: Node, name: string): Promise<void>

    sync(node: Node): Promise<Node>
}

export interface ContentInformation {
    node: Node
    kind: ContentKind
    modifyTime: number
    createTime: number
    executable: boolean
    writable: boolean
}

export enum ContentKind {
    File = "File",
    Directory = "Directory",
}

export interface DirectoryEntry {
    kind: ContentKind
    name: string
    node: Node
}