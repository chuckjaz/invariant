import { createHash, randomBytes } from 'node:crypto'
import { Data, ManagedStorageClient, StorageClient, StorageBlock } from "../client";
import { normalizeCode } from '../../common/codes';
import { hashTransform } from '../../common/data';
import { BrokerClient } from '../../broker/client';

export interface MockStorageClient extends ManagedStorageClient {
    id: string
}

export function mockStorage(broker?: BrokerClient): MockStorageClient {
    const store = new Map<string, MockStorageBlock>()
    const idBytes = randomBytes(32)
    const id = idBytes.toString('hex')

    async function ping(): Promise<string> { return id }

    async function get(address: string): Promise<Data | false> {
        const normalCode = normalizeCode(address)
        if (normalCode) {
            const block = store.get(normalCode)
            if (block) {
                block.lastAccess = Date.now()
                return dataOf(block.buffers)
            }
        }
        return false
    }

    async function has(address: string): Promise<boolean> {
        const normalCode = normalizeCode(address)
        return normalCode != undefined && store.has(normalCode)
    }

    async function post(address: Data): Promise<string | false> {
        const hash = createHash('sha256')
        const buffers = await buffersOfData(hashTransform(address, hash))
        const id = hash.digest().toString('hex')
        const size = sizeOfBuffers(buffers)
        store.set(id, { buffers, size, lastAccess: Date.now() })
        return id
    }

    async function put(address: string, data: Data): Promise<boolean> {
        const hash = createHash('sha256')
        const buffers = await buffersOfData(hashTransform(data, hash))
        const id = hash.digest().toString('hex')
        if (address != id) return false
        const size = sizeOfBuffers(buffers)
        store.set(id, { buffers, size, lastAccess: Date.now() })
        return true
    }

    async function fetch(address: string, container?: string): Promise<boolean> {
        let otherStorage: StorageClient | undefined = undefined
        if (broker && container) {
            otherStorage = await broker.storage(container)
        }
        if (otherStorage) {
            const data = await otherStorage.get(address)
            if (data) {
                const hash = createHash('sha256')
                const buffers = await buffersOfData(hashTransform(data, hash))
                const id = hash.digest().toString('hex')
                if (address != id) return false
                const size = sizeOfBuffers(buffers)
                store.set(id, { buffers, size, lastAccess: Date.now() })
                return true
            }
        }
        return false
    }

    async function forget(address: string) {
        if (store.has(address)) {
            store.delete(address)
            return true
        }
        return false
    }

    async function *blocks(): AsyncIterable<StorageBlock> {
        for (const [address, block] of store.entries()) {
            yield {
                address,
                size: block.size,
                lastAccess: block.lastAccess
            }
        }
    }

    return {
        id,
        ping,
        get,
        has,
        post,
        put,
        fetch,
        forget,
        blocks
    }
}

interface MockStorageBlock {
    buffers: Buffer[]
    size: number
    lastAccess: number
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

function sizeOfBuffers(buffers: Buffer[]): number {
    let result = 0
    for (const buffer of buffers) {
        result += buffer.length
    }
    return result
}
