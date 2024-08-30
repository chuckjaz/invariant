import { Blob } from "buffer";
import { normalizeCode } from "../../common/codes";
import { PingableClient } from "../../common/pingable_client";
import { Data, StorageClient } from "../client";

export class Storage extends PingableClient implements StorageClient {
    constructor(id: string, url: URL) {
        super(id, url)
    }

    async get(code: string, algorithm?: string): Promise<Blob | undefined> {
        const id = normalizeCode(code)
        if (id) {
            const request = new URL(`/storage/${algorithm ?? 'sha256'}/${id}`, this.url)
            const response = await fetch(request)
            if (response.status == 200) {
                return await response.blob()
            }
        }
    }

    async has(code: string, algorithm?: string): Promise<boolean> {
        const id = normalizeCode(code)
        if (id) {
            const request = new URL(`/storage/${algorithm ?? 'sha256'}/${id}`, this.url)
            const response = await fetch(request, { method: 'HEAD' })
            return response.status == 200
        }
        return false
    }

    async put(code: string, data: Data, algorithm?: string): Promise<boolean> {
        const id = normalizeCode(code)
        if (id) {
            const response = await fetch(new URL(`/storage/${algorithm ?? 'sha256'}/${id}`, this.url), {
                method: 'PUT',
                body: data,
                duplex: 'half'
            })
            return response.status == 200
        }
        return false
    }

    async post(data: Data, algorithm?: string): Promise<string | undefined> {
        const response = await fetch(new URL(`/storage/${algorithm ?? 'sha256'}/`, this.url), {
            method: 'POST',
            body: data,
            duplex: 'half'
        })
        if (response.status == 200) {
            const url = await response.text()
            const storagePrefix = `/storage/`
            if (url.startsWith(storagePrefix)) {
                return url.substring(storagePrefix.length)
            }
        }
    }
}
