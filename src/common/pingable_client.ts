import { dataToReadable, jsonStream, jsonStreamToText, safeParseJson, textStreamFromWeb, textToReadable } from "./parseJson"

const idPrefix = '/id/'

export class PingableClient {
    url: URL
    id?: string

    constructor(url: URL, id?: string) {
        this.url = url
        this.id = id
    }

    async ping(): Promise<string | undefined> {
        try {
            const result = await fetch(new URL(idPrefix, this.url))
            if (result.status == 200) {
                const id = await result.text()
                this.id = id
                return id
            }
        } catch(e) {
            console.error('ping error', e)
        }
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
            } catch(e) {
                throw new Error(`Invalid JSON format received: ${e}`)
            }
        } else {
            throw new Error(`Could not receive JSON: ${response.status}`)
        }
    }

    protected async getJsonOrUndefined<T>(prefix: string): Promise<T | undefined> {
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
        } else if (response.status == 404) {
            return undefined
        } else {
            throw new Error(`Could not receive JSON: ${response.status}`)
        }
    }

    protected async getJsonStream<T>(prefix: string | URL): Promise<AsyncIterable<T>> {
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

    protected async postJson<T>(data: any, prefix: string | URL): Promise<T> {
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

    protected async postJsonOrUndefined<T>(data: any, prefix: string | URL): Promise<T | undefined> {
        const request = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        }
        const response = await fetch(new URL(prefix, this.url), request)
        if (response.ok) {
            return await response.json() as T
        } else if (response.status == 404) {
            return undefined
        } else {
            throw new Error(`Invalid response: ${response.status}`)
        }
    }

    protected async putJsonStream<A>(stream: AsyncIterable<A>, prefix: string): Promise<void> {
        const request = {
            method: 'POST',
            header: { 'Content-Type': 'application/json' },
            body: textToReadable(jsonStreamToText(stream))
        }
        const response = await fetch(new URL(prefix, this.url), request)
        if (!response) throw new Error('Invalid request');
    }

    protected async postJsonStreams<A, R>(stream: AsyncIterable<A>, prefix: string): Promise<AsyncIterable<R>> {
        const request = {
            method: 'POST',
            header: { 'Content-Type': 'application/json' },
            body: textToReadable(jsonStreamToText(stream))
        }
        const response = await fetch(new URL(prefix, this.url), request)
        if (!response || !response.body) throw new Error('Invalid request')
        const textStream = await textStreamFromWeb(response.body.getReader())
        return jsonStream<R>(textStream)
    }
}
