import { Blob } from 'node:buffer'

export interface StorageClient {
    id: string
    ping(): Promise<boolean>
    get(code: string, algorithm?: string): Promise<Blob | undefined>
    has(code: string, algorithm?: string): Promise<boolean>
}

