import { jsonStream, safeParseJson } from "./parseJson"

const idPrefix = '/id/'

export class PingableClient {
    url: URL
    id: string

    constructor(id: string, url: URL) {
        this.url = url
        this.id = id
    }

    async ping(): Promise<string | undefined> {
        try {
            const result = await fetch(new URL(idPrefix, this.url))
            if (result.status == 200) {
                const id = await result.text()
                return id
            }
        } catch {}
    }

    protected async getJson<T>(prefix: string): Promise<T> {
        const request = {
            headers: { 'Content-Type': 'application/json' },
        }
        const response = await fetch(new URL(prefix, this.url), request)
        if (response.ok) {
            const text = await response.text()
            try {
                return JSON.parse(text) as T
            } finally {
                throw new Error("Invalid JSON format received")
            }
        } else {
            throw new Error(`Could not receive JSON: ${response.status}`)
        }
    }

    protected async getJsonStream<T>(prefix: string): Promise<AsyncIterable<T>> {
        return await jsonStream<T>(new URL(prefix, this.url))
    }

    protected async putJson(data: any, prefix: string): Promise<boolean> {
        const request = {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        }
        const response = await fetch(new URL(prefix, this.url), request)
        if (response.ok) return true
        if (response.status >= 500) throw new Error(`Invalid response: ${response.status}`)
        return false
    }

    protected async postJson<T>(data: any, prefix: string): Promise<T> {
        const request = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        }
        const response = await fetch(new URL(prefix, this.url), request)
        if (response.ok) {
            return await response.json() as T
        }
        else {
            throw new Error(`Invalid response: ${response.status}`)
        }
    }
}
