import { ContentLink } from "../common/types"
import { Data } from "../storage/storage_client"

export type Node = number

export enum ContentKind {
    File = "File",
    Directory = "Directory",
    SymbolicLink = "SymbolicLink"
}

export interface ContentInformationCommon {
    node: Node
    kind: ContentKind
    modifyTime: number
    createTime: number
    executable: boolean
    writable: boolean
    etag: string
}

export interface FileContentInformation extends ContentInformationCommon {
    kind: ContentKind.File
    size: number
    type?: string
}

export interface DirectoryContentInformation extends ContentInformationCommon {
    kind: ContentKind.Directory
    size: number
}

export interface SymbolicLinkContentInformation extends ContentInformationCommon {
    kind: ContentKind.SymbolicLink
    target: string
}

export type ContentInformation = FileContentInformation | DirectoryContentInformation |
    SymbolicLinkContentInformation

export interface FileDirectoryEntry {
    name: string
    info: ContentInformation
}

export interface EntryAttributes {
    executable?: boolean
    writable?: boolean
    modifyTime?: number
    createTime?: number
    size?: number
    type?: string | null
}

export interface FilesClient {
    ping(): Promise<string | undefined>

    mount(content: ContentLink, executable?: boolean, writable?: boolean): Promise<Node>
    unmount(node: Node): Promise<ContentLink>

    lookup(parent: Node, name: string): Promise<ContentInformation | undefined>
    info(node: Node): Promise<ContentInformation>
    content(node: Node): Promise<ContentLink>

    readFile(node: Node, offset?: number, length?: number): Data
    writeFile(node: Node, data: Data, offset?: number, length?: number): Promise<number>
    setSize(node: Node, size: number): Promise<ContentInformation>

    readDirectory(node: Node, offset?: number, length?: number): AsyncIterable<FileDirectoryEntry>

    createFile(parent: Node, name: string, content?: ContentLink): Promise<FileContentInformation>
    createDirectory(parent: Node, name: string, content?: ContentLink): Promise<DirectoryContentInformation>
    createSymbolicLink(parent: Node, name: string, target: string): Promise<SymbolicLinkContentInformation>

    remove(parent: Node, name: string): Promise<boolean>
    setAttributes(node: Node, attributes: EntryAttributes): Promise<ContentInformation>
    rename(parent: Node, name: string,  newParent: Node, newName: string): Promise<void>
    link(parent: Node, node: Node, name: string): Promise<void>

    sync(): Promise<void>
}

export interface ContentReader {
    readContentLink(content: ContentLink): Data
}

export interface ContentWriter {
    writeContentLink(data: Data): Promise<ContentLink>
}