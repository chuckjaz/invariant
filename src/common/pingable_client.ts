const idPrefix = '/id/'

export class PingableClient {
    id: string
    url: URL

    constructor(id: string, url: URL) {
        this.id = id
        this.url = url
    }

    async ping(): Promise<boolean> {
        try {
            const result = await fetch(new URL(idPrefix, this.url))
            if (result.status == 200) return true
        } catch {}
        return false
    }

    protected async putJson(data: any, prefix: string): Promise<void> {
        const request = {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        }
        await fetch(new URL(prefix, this.url), request)
    }

    protected async postJson<T>(data: any, prefix: string): Promise<T | undefined> {
        const request = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        }
        const response = await fetch(new URL(prefix, this.url), request)
        if (response.status == 200) {
            return response.json() as T
        }
    }
}