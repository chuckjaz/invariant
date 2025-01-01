import { Blob } from 'node:buffer'

export type Data = AsyncIterable<Buffer>

export interface StorageClient {
    ping(): Promise<string | undefined>
    get(address: string): Promise<Data | false>
    has(address: string): Promise<boolean>
    put(address: string, data: Data): Promise<boolean>
    post(data: Data): Promise<string | false>
    fetch(address: string, container?: string): Promise<boolean>
}

export interface ManagedStorageClient extends StorageClient {
    forget(address: string): Promise<boolean>
    blocks(): AsyncIterable<StorageBlock>
}

export interface StorageBlock {
    address: string
    size: number
    lastAccess: number
}