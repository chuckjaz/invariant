export interface BrokerLocationResponse {
    id: string;
    url: string;
    ttl?: number;
    token?: string;
}

export interface BrokerRegisterRequest {
    id: string;
    url: string;
    kind?: string;
}

export interface BrokerRegisterResponse {
    id: string;
    salt?: string;
    minnonce?: number;
}

export type BrokerServiceQueryResponse = string[]

export interface FindHasRequest {
    container: string
    ids: string[]
}

export interface FindNotifyRequest {
    find: string
}

export interface FindHasResponseEntry {
    kind: "HAS"
    id: string
}

export interface FindCloserResponseEntry {
    kind: "CLOSER"
    id: string
}

export type FindResponseEntry = FindHasResponseEntry | FindCloserResponseEntry

export type FindResponse = FindResponseEntry[]

export interface SlotsGetResponse {
    address: string
    previous: string | "root"
    signature?: string
    proof?: string
}

export interface SlotsPutRequest {
    address: string
    previous: string
    signature?: string
    proof?: string
}

export interface SlotsRegisterRequest {
    id: string
    address: string
    signature?: any
    proof?: any
}

export interface SlotConfiguration {
    signature?: any
    proof?: any
}

export enum EntryKind {
    File = "File",
    Directory = "Directory",
}

export interface BaseEntry {
    kind: EntryKind
    name: string
    content: ContentLink
    createTime?: number
    modifyTime?: number
}

export interface FileEntry extends BaseEntry {
    kind: EntryKind.File
    size?: number
    type?: string
    mode?: string
}

export interface DirectoryEntry extends BaseEntry {
    kind: EntryKind.Directory
}

export type Entry = FileEntry | DirectoryEntry

export interface ContentLink {
    address: string
    slot?: boolean
    key?: string
    algorithm?: string
    salt?: string
    blockTree?: boolean
    primary?: string
}

export interface Block {
    content: ContentLink
    size: number
}

export type BlockTree = Block[]

export type DistributorPutPinRequest = AsyncIterable<string>

export type DistributorPutUnpinRequest = AsyncIterable<string>

export type DistributorPutRegisterStorage = AsyncIterable<string>

export type DistributorPutUnregisterStorage = AsyncIterable<string>

export type DistributorPostBlocksRequest = AsyncIterable<string>

export interface DistributorPostBlocksResponseItem {
    block: string
    storages: string[]
}

export type DistributorPostBlocksResponse = AsyncIterable<DistributorPostBlocksResponseItem>
