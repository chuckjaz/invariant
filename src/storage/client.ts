import { Blob } from 'node:buffer'
import { ReadableStream } from 'node:stream/web'

export interface StorageClient {
    id: string
    ping(): Promise<boolean>
    get(code: string, algorithm?: string): Promise<Blob>
    has(code: string, algorithm?: string): Promise<boolean>
}

