import { Blob } from "buffer";
import { normalizeCode } from "../../common/codes";
import { PingableClient } from "../../common/pingable_client";
import { Data, StorageClient } from "../client";
import { streamBlob } from "../../common/blob";

export class Storage extends PingableClient implements StorageClient {
    private hook: (url: URL, init?: RequestInit) => RequestInit | undefined

    constructor(id: string, url: URL, hook?: (url: URL, init?: RequestInit) => RequestInit | undefined) {
        super(id, url)
        this.hook = hook ?? ((_, i) => i)
    }

    async get(code: string, algorithm?: string): Promise<Data | false> {
        const id = normalizeCode(code)
        if (id) {
            const request = new URL(`/storage/${algorithm ?? 'sha256'}/${id}`, this.url)
            const response = await fetch(request, this.hook(request))
            if (response.status == 200) {
                return streamBlob(await response.blob())
            }
        }
        return false
    }

    async has(code: string, algorithm?: string): Promise<boolean> {
        const id = normalizeCode(code)
        if (id) {
            const request = new URL(`/storage/${algorithm ?? 'sha256'}/${id}`, this.url)
            const response = await fetch(request, this.hook(request, { method: 'HEAD' }))
            return response.status == 200
        }
        return false
    }

    async put(code: string, data: Data, algorithm?: string): Promise<boolean> {
        const id = normalizeCode(code)
        if (id) {
            const request = new URL(`/storage/${algorithm ?? 'sha256'}/${id}`, this.url)
            const response = await fetch(request, this.hook(request, {
                method: 'PUT',
                body: data,
                duplex: 'half'
            }))
            return response.status == 200
        }
        return false
    }

    async post(data: Data, algorithm?: string): Promise<string | false> {
        const request = new URL(`/storage/${algorithm ?? 'sha256'}/`, this.url)
        const response = await fetch(request, this.hook(request, {
            method: 'POST',
            body: data,
            duplex: 'half'
        }))
        if (response.status == 200) {
            const url = await response.text()
            const storagePrefix = `/storage/`
            if (url.startsWith(storagePrefix)) {
                return url.substring(storagePrefix.length)
            }
        }
        return false
    }
}
