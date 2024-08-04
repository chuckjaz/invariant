import { normalizeCode } from "../../common/codes";
import { StorageClient } from "../client";

export function webClient(id: string, url: string): StorageClient {
    async function ping(): Promise<boolean> {
        const request = new URL(`/id/`, url)
        const response = await fetch(request)
        if (response.status == 200) {
            const text = await response.text()
            return normalizeCode(text) == id
        }
        return false
    }

    async function get(code: string, algorithm?: string): Promise<Blob> {
        const id = normalizeCode(code)
        if (id) {
            const request = new URL(`/storage/${algorithm ?? 'sha256'}/${id}`, url)
            const response = await fetch(request)
            if (response.status == 200) {
                return await response.blob()
            }
        }
        throw new Error('Not found')
    }

    async function has(code: string, algorithm?: string): Promise<boolean> {
        const id = normalizeCode(code)
        if (id) {
            const request = new URL(`/storage/${algorithm ?? 'sha256'}/${id}`, url)
            const response = await fetch(request, { method: 'HEAD' })
            return response.status == 200
        }
        return false
    }

    return {
        id,
        ping,
        get,
        has
    }
}