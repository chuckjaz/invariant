import { Blob } from "buffer";
import { normalizeCode } from "../../common/codes";
import { PingableClient } from "../../common/pingable_client";
import { StorageClient } from "../client";

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
}
