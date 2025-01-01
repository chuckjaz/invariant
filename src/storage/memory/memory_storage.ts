import { hashTransform } from "../../common/data";
import { Data, ManagedStorageClient, StorageBlock } from "../storage_client";
import { createHash, randomBytes } from 'node:crypto'

type DataArray = Buffer[]

export class MemoryStorage implements ManagedStorageClient {
    private id = randomBytes(32).toString('hex')
    private store = new Map<string, StorageData>()

    async ping(): Promise<string | undefined> {
        return this.id
    }

    async get(address: string): Promise<Data | false> {
        const storageData = this.store.get(address)
        if (storageData) {
            storageData.lastAccess = Date.now()
            return sendData(storageData.data)
        } else {
            return false
        }
    }

    async has(address: string): Promise<boolean> {
        return this.store.has(address)
    }

    async put(address: string, data: Data): Promise<boolean> {
        const [dataArray, dataAddress] = await receiveData(data)
        if (address == dataAddress) {
            this.store.set(address, { data: dataArray, lastAccess: Date.now() })
            return true
        }
        return false
    }

    async post(data: Data): Promise<string | false> {
        const [dataArray, dataAddress] = await receiveData(data)
        this.store.set(dataAddress, { data: dataArray, lastAccess: Date.now() })
        return dataAddress
    }

    async fetch(): Promise<boolean> {
        return false
    }

    async forget(address: string): Promise<boolean> {
        if (this.store.has(address)) {
            this.store.delete(address)
            return true
        }
        return false
    }

    async *blocks(): AsyncIterable<StorageBlock> {
        for (const [address, block] of this.store.entries()) {
            const size = block.data.reduce((p, b) => p + b.length, 0)
            yield { address, size, lastAccess: block.lastAccess }
        }
    }
}

async function *sendData(data: DataArray): Data {
    yield *data
}

async function receiveData(data: Data): Promise<[DataArray, string]> {
    const hash = createHash('sha256')
    const result: DataArray = []
    for await (const buffer of hashTransform(data, hash)) {
        result.push(buffer)
    }
    const address = hash.digest().toString('hex')
    return [result, address]
}

interface StorageData {
    data: DataArray
    lastAccess: number
}
