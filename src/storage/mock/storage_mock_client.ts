import { createHash, randomBytes } from 'node:crypto'
import { Data, ManagedStorageClient, StorageClient, StorageBlock } from "../storage_client";
import { normalizeCode } from '../../common/codes';
import { hashTransform } from '../../common/data';
import { BrokerClient } from '../../broker/broker_client';
import { Logger } from '../../common/web';

export interface MockStorageClient extends ManagedStorageClient {
    id: string
}

class MockStorageClientImpl implements MockStorageClient {
    store = new Map<string, MockStorageBlock>()
    idBytes = randomBytes(32)
    id = this.idBytes.toString('hex')
    broker?: BrokerClient

    constructor(broker?: BrokerClient) {
        this.broker = broker
    }

    async ping(): Promise<string> { return this.id }

    async get(address: string): Promise<Data | false> {
        const normalCode = normalizeCode(address)
        if (normalCode) {
            const block = this.store.get(normalCode)
            if (block) {
                block.lastAccess = Date.now()
                return dataOf(block.buffers)
            }
        }
        return false
    }

    async has(address: string): Promise<boolean> {
        const normalCode = normalizeCode(address)
        return normalCode != undefined && this.store.has(normalCode)
    }

    async post(data: Data): Promise<string | false> {
        const hash = createHash('sha256')
        const buffers = await buffersOfData(hashTransform(data, hash))
        const id = hash.digest().toString('hex')
        const size = sizeOfBuffers(buffers)
        this.store.set(id, { buffers, size, lastAccess: Date.now() })
        return id
    }

    async put(address: string, data: Data): Promise<boolean> {
        const hash = createHash('sha256')
        const buffers = await buffersOfData(hashTransform(data, hash))
        const id = hash.digest().toString('hex')
        if (address != id) return false
        const size = sizeOfBuffers(buffers)
        this.store.set(id, { buffers, size, lastAccess: Date.now() })
        return true
    }

    async fetch(address: string, container?: string): Promise<boolean> {
        let otherStorage: StorageClient | undefined = undefined
        if (this.broker && container) {
            otherStorage = await this.broker.storage(container)
        }
        if (otherStorage) {
            const data = await otherStorage.get(address)
            if (data) {
                const hash = createHash('sha256')
                const buffers = await buffersOfData(hashTransform(data, hash))
                const id = hash.digest().toString('hex')
                if (address != id) return false
                const size = sizeOfBuffers(buffers)
                this.store.set(id, { buffers, size, lastAccess: Date.now() })
                return true
            }
        }
        return false
    }

    async forget(address: string) {
        if (this.store.has(address)) {
            this.store.delete(address)
            return true
        }
        return false
    }

    async *blocks(): AsyncIterable<StorageBlock> {
        for (const [address, block] of this.store.entries()) {
            yield {
                address,
                size: block.size,
                lastAccess: block.lastAccess
            }
        }
    }
}

export function mockStorage(broker?: BrokerClient): MockStorageClient {
    return new MockStorageClientImpl(broker)
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
