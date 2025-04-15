export interface BrokerLocationResponse {
    id: string;
    urls: string[];
    ttl?: number;
    token?: string;
}

export interface BrokerRegisterRequest {
    id: string;
    urls: string[];
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
    time?: number
    signature?: string
    proof?: string
}

export interface SlotsPutRequest {
    address: string
    previous: string
    time?: number
    signature?: string
    proof?: string
}

export interface SlotsRegisterRequest {
    id: string
    address: string
    time?: number
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
    mode?: string
}

export interface FileEntry extends BaseEntry {
    kind: EntryKind.File
    size?: number
    type?: string
}

export interface DirectoryEntry extends BaseEntry {
    kind: EntryKind.Directory
}

export type Entry = FileEntry | DirectoryEntry

export interface ContentLink {
    address: string
    slot?: boolean
    transforms?: ContentTransform[]
    expected?: string
    primary?: string
    etag?: string
}

export function etagOf(content: ContentLink): string {
    return content.etag ?? content.expected ?? content.address
}

export type ContentTransform =
    BlocksTransform |
    AesCbcDecipherTransform |
    DecompressTransform

export interface BlocksTransform {
    kind: "Blocks"
}

export interface AesCbcDecipherTransform {
    kind: "Decipher"
    algorithm: "aes-256-cbc"
    key: string
    iv: string
}

export interface DecompressTransform {
    kind: "Decompress"
    algorithm: "inflate" | "brotli" | "unzip"
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
