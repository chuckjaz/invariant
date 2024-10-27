import { Blob } from 'node:buffer'

export type Data = AsyncIterable<Buffer>

export interface StorageClient {
    ping(): Promise<string | undefined>
    get(code: string): Promise<Data | false>
    has(code: string): Promise<boolean>
    put(code: string, data: Data): Promise<boolean>
    post(data: Data): Promise<string | false>
    fetch(code: string, container?: string): Promise<boolean>
}
