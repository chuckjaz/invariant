import { ReadableStream } from 'node:stream/web'
import { createHash, randomBytes } from 'node:crypto'

import { StorageClient } from "../client";
import { normalizeCode } from '../../common/codes';

export interface MockStorageClient extends StorageClient {
    post(data: ReadableStream | string, algorithm?: string): Promise<string>
    put(code: string, data: ReadableStream | string, algorithm?: string): Promise<void>
}

export function mockStorage(): MockStorageClient {
    const store = new Map<string, Uint8Array>()
    const idBytes = randomBytes(32)
    const id = idBytes.toString('hex')

    function validateAlgorithm(algorithm?: string) {
        if (algorithm && algorithm != 'sha256') {
            throw Error(`Unrecognized algorithm`)
        }
    }

    async function ping() { return true }

    async function get(code: string, algorithm?: string): Promise<Blob> {
        validateAlgorithm(algorithm)
        const normalCode = normalizeCode(code)
        if (normalCode) {
            const buffer = store.get(normalCode)
            if (buffer) {
                return new Blob([buffer])
            }
        }
        throw new Error('Not found')
    }

    async function has(code: string, algorithm?: string): Promise<boolean> {
        validateAlgorithm(algorithm)
        const normalCode = normalizeCode(code)
        return normalCode != undefined && store.has(normalCode)
    }

    async function post(data: ReadableStream | string, algorithm?: string): Promise<string> {
        validateAlgorithm(algorithm)
        if (typeof data == 'string') {
            const encoder = new TextEncoder()
            const u8Array = encoder.encode(data)
            const hash = createHash('sha256')
            hash.update(u8Array)
            const id = hash.digest().toString('hex')
            store.set(id, u8Array)
            return id
        } else {
            throw new Error('Not supported yet')
        }
    }

    async function put(code: string, data: ReadableStream | string, algorithm?: string): Promise<void> {
        validateAlgorithm(algorithm)
        if (typeof data == 'string') {
            const encoder = new TextEncoder()
            const u8Array = encoder.encode(data)
            const hash = createHash('sha256')
            hash.update(u8Array)
            const id = hash.digest().toString('hex')
            if (code != id) throw Error('Content/id mismatch')
            store.set(id, u8Array)
        } else {
            throw new Error('NOt supported yet')
        }
    }


    return {
        id,
        ping,
        get,
        has,
        post,
        put,
    }
}