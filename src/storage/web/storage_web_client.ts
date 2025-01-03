import { normalizeCode } from "../../common/codes";
import { PingableClient } from "../../common/pingable_client";
import { Data, StorageClient } from "../storage_client";
import { streamBlob } from "../../common/blob";

const storagePrefix = '/storage/'

export class StorageWebClient extends PingableClient implements StorageClient {
    private hook: (url: URL, init?: RequestInit) => RequestInit | undefined
    private fetchSupported = true

    constructor(url: URL, id?: string, hook?: (url: URL, init?: RequestInit) => RequestInit | undefined) {
        super(url, id)
        this.hook = hook ?? ((_, i) => i)
    }

    async get(code: string): Promise<Data | false> {
        const id = normalizeCode(code)
        if (id) {
            const request = new URL(`${storagePrefix}${id}`, this.url)
            const response = await fetch(request, this.hook(request))
            if (response.status == 200) {
                return streamBlob(await response.blob())
            }
        }
        return false
    }

    async has(code: string): Promise<boolean> {
        const id = normalizeCode(code)
        if (id) {
            const request = new URL(`${storagePrefix}${id}`, this.url)
            const response = await fetch(request, this.hook(request, { method: 'HEAD' }))
            return response.status == 200
        }
        return false
    }

    async put(code: string, data: Data): Promise<boolean> {
        const id = normalizeCode(code)
        if (id) {
            const request = new URL(`${storagePrefix}${id}`, this.url)
            const response = await fetch(request, this.hook(request, {
                method: 'PUT',
                body: data,
                duplex: 'half'
            }))
            return response.status == 200
        }
        return false
    }

    async post(data: Data): Promise<string | false> {
        const request = new URL(storagePrefix, this.url)
        const response = await fetch(request, this.hook(request, {
            method: 'POST',
            body: data,
            duplex: 'half'
        }))
        if (response.status == 200) {
            return await response.text()
        }
        return false
    }

    async fetch(address: string, container?: string): Promise<boolean> {
        if (!this.fetchSupported) return false
        const request = new URL(`${storagePrefix}fetch`, this.url)
        const response = await fetch(request, this.hook(request, {
            method: 'PUT',
            body: JSON.stringify({ address, container }),
            duplex: 'half'
        }))
        if (response.status == 200) return true
        if (response.status == 400) this.fetchSupported = false
        if (response.status >= 500) throw new Error(`Invalid response: ${response.status}`,)
        return false
    }
}
