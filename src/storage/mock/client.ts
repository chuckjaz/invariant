import { createHash, randomBytes } from 'node:crypto'
import { Data, StorageClient } from "../client";
import { normalizeCode } from '../../common/codes';
import { hashTransform } from '../../common/data';
import { BrokerClient } from '../../broker/client';

export interface MockStorageClient extends StorageClient {
    id: string
}

export function mockStorage(broker?: BrokerClient): MockStorageClient {
    const store = new Map<string, Buffer[]>()
    const idBytes = randomBytes(32)
    const id = idBytes.toString('hex')

    function validateAlgorithm(algorithm?: string) {
        if (algorithm && algorithm != 'sha256') {
            throw Error(`Unrecognized algorithm`)
        }
    }

    async function ping(): Promise<string> { return id }

    async function get(code: string, algorithm?: string): Promise<Data | false> {
        validateAlgorithm(algorithm)
        const normalCode = normalizeCode(code)
        if (normalCode) {
            const buffers = store.get(normalCode)
            if (buffers) {
                return dataOf(buffers)
            }
        }
        return false
    }

    async function has(code: string, algorithm?: string): Promise<boolean> {
        validateAlgorithm(algorithm)
        const normalCode = normalizeCode(code)
        return normalCode != undefined && store.has(normalCode)
    }

    async function post(data: Data, algorithm?: string): Promise<string | false> {
        validateAlgorithm(algorithm)
        const hash = createHash('sha256')
        const buffers = await buffersOfData(hashTransform(data, hash))
        const id = hash.digest().toString('hex')
        store.set(id, buffers)
        return id
    }

    async function put(code: string, data: Data, algorithm?: string): Promise<boolean> {
        validateAlgorithm(algorithm)
        const hash = createHash('sha256')
        const buffers = await buffersOfData(hashTransform(data, hash))
        const id = hash.digest().toString('hex')
        if (code != id) return false
        store.set(id, buffers)
        return true
    }

    async function fetch(code: string, container?: string, algorithm?: string): Promise<boolean> {
        let otherStorage: StorageClient | undefined = undefined
        if (broker && container) {
            otherStorage = await broker.storage(container)
        }
        if (otherStorage) {
            const data = await otherStorage.get(code)
            if (data) {
                const hash = createHash('sha256')
                const buffers = await buffersOfData(hashTransform(data, hash))
                const id = hash.digest().toString('hex')
                if (code != id) return false
                store.set(id, buffers)
                return true
            }
        }
        return false
    }

    return {
        id,
        ping,
        get,
        has,
        post,
        put,
        fetch
    }
}

async function *dataOf(buffers: Buffer[]): Data {
    yield *buffers
}

async function buffersOfData(data: Data): Promise<Buffer[]> {
    const buffers: Buffer[] = []
    for await (const buffer of data) {
        buffers.push(buffer)
    }
    return buffers
}