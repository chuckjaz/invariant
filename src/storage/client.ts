import { Blob } from 'node:buffer'

export type Data =
    ArrayBuffer |
    AsyncIterable<Uint8Array> |
    Blob |
    Iterable<Uint8Array> |
    string

export interface StorageClient {
    id: string
    ping(): Promise<string | undefined>
    get(code: string, algorithm?: string): Promise<Blob | undefined>
    has(code: string, algorithm?: string): Promise<boolean>
    put(code: string, data: Data, algorithm?: string): Promise<boolean>
    post(data: Data, algorithm?: string): Promise<string | undefined>
}
