import { normalizeCode } from "../../common/codes";
import { PingableClient } from "../../common/pingable_client";
import { Data, ManagedStorageClient, StorageBlock, StorageClient } from "../storage_client";
import { streamBlob } from "../../common/blob";
import { log_fetch } from "../../common/log_fetch";
import { invalid } from "../../common/errors";
import { jsonStream } from "../../common/parseJson";

const storagePrefix = '/storage/'

enum OptionalApi {
    Unchecked,
    Supported,
    Unsupported,
}

export class StorageWebClient extends PingableClient implements StorageClient, ManagedStorageClient {
    private hook: (url: URL, init?: RequestInit) => RequestInit | undefined
    private fetchSupported = OptionalApi.Unchecked
    private forgetSupported = OptionalApi.Unchecked
    private blocksSupported = OptionalApi.Unchecked

    constructor(url: URL, id?: string, hook?: (url: URL, init?: RequestInit) => RequestInit | undefined) {
        super(url, id)
        this.hook = hook ?? ((_, i) => i)
    }

    async get(code: string): Promise<Data | false> {
        const id = normalizeCode(code)
        if (id) {
            const request = new URL(`${storagePrefix}${id}`, this.url)
            const response = await log_fetch(request, this.hook(request))
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
            const response = await log_fetch(request, this.hook(request, { method: 'HEAD' }))
            return response.status == 200
        }
        return false
    }

    async put(code: string, data: Data): Promise<boolean> {
        const id = normalizeCode(code)
        if (id) {
            const request = new URL(`${storagePrefix}${id}`, this.url)
            const response = await log_fetch(request, this.hook(request, {
                method: 'PUT',
                body: data as any,
                duplex: 'half'
            }))
            return response.status == 200
        }
        return false
    }

    async post(data: Data): Promise<string | false> {
        const request = new URL(storagePrefix, this.url)
        const response = await log_fetch(request, this.hook(request, {
            method: 'POST',
            body: data as any,
            duplex: 'half'
        }))
        if (response.status == 200) {
            return await response.text()
        }
        return false
    }

    async fetch(address: string, container?: string): Promise<boolean> {
        switch (this.fetchSupported) {
            case OptionalApi.Unsupported: return false
            case OptionalApi.Unchecked: {
                if (await this.checkApi('fetch')) {
                    this.fetchSupported = OptionalApi.Supported
                } else {
                    this.fetchSupported = OptionalApi.Unsupported
                    return false
                }
            }
        }
        const request = new URL(`${storagePrefix}fetch`, this.url)
        const response = await log_fetch(request, this.hook(request, {
            method: 'PUT',
            body: JSON.stringify({ address, container }),
            duplex: 'half'
        }))
        if (response.status == 200) return true
        if (response.status == 400) this.fetchSupported = OptionalApi.Unsupported
        if (response.status >= 500) throw new Error(`Invalid response: ${response.status}`,)
        return false
    }

    async forget(address: string): Promise<boolean> {
        switch (this.forgetSupported) {
            case OptionalApi.Unsupported: return false
            case OptionalApi.Unchecked: {
                if (await this.checkApi('forget')) {
                    this.forgetSupported = OptionalApi.Supported
                } else {
                    this.forgetSupported = OptionalApi.Unsupported
                    return false
                }
            }
        }
        const request = new URL(`${storagePrefix}forget/${address}`, this.url)
        const response = await log_fetch(request, this.hook(request, {
            method: 'PUT',
            body: '',
            duplex: 'half'
        }))
        if (response.status == 200) return true
        if (response.status >= 500) invalid(`Invalid response: ${response.status}`, response.status);
        return false
    }

    async *blocks(count?: number, after?: string): AsyncIterable<StorageBlock> {
        switch (this.blocksSupported) {
            case OptionalApi.Unsupported: return
            case OptionalApi.Unchecked: {
                if (await this.checkApi('blocks')) {
                    this.blocksSupported = OptionalApi.Supported
                } else {
                    this.blocksSupported = OptionalApi.Unsupported
                    return
                }
            }
        }
        const request = new URL(`${storagePrefix}blocks`, this.url)
        if (count)
            request.searchParams.append('count', `${count}`)
        if (after)
            request.searchParams.append('after', after)
        yield* jsonStream<StorageBlock>(request, { limit: count })
    }

    private async checkApi(name: string): Promise<Boolean> {
        const request = new URL(`${storagePrefix}${name}`, this.url)
        const response = await log_fetch(request, this.hook(request, {
            method: 'HEAD',
            duplex: 'half'
        }))
        return response.ok
    }
}
