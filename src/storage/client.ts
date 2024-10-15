import { Blob } from 'node:buffer'

export type Data = AsyncIterable<Buffer>

export interface StorageClient {
    ping(): Promise<string | undefined>
    get(code: string, algorithm?: string): Promise<Data | false>
    has(code: string, algorithm?: string): Promise<boolean>
    put(code: string, data: Data, algorithm?: string): Promise<boolean>
    post(data: Data, algorithm?: string): Promise<string | false>
}
