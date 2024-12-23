import { BrokerClient } from "../../broker/broker_client"
import { mockBroker } from "../../broker/mock/mock_broker_client"
import { dataFromBuffers } from "../../common/data"
import { FindClient } from "../../find/client"
import { findServer } from "../../find/server"
import { StorageClient } from "../client"
import { mockStorage } from "../mock"
import { BlockFindingStorage } from "./storage_find"
import { createHash } from 'node:crypto'

describe("storage/find", () => {
    it("can create a BlockFindingStorage", async () => {
        const broker = mockBroker()
        const finder = await findServer(broker)
        const storage = new BlockFindingStorage(broker, finder)
        expect(storage).toBeDefined()
    })
    it("can find a value in a the backing storage", async () => {
        const [broker, finders, storages, addresses] = await setup(1, 1, 1)
        const finder = finders[0]
        const backingStorage = storages[0]
        const backingStorageId = await backingStorage.ping()
        expect(backingStorageId).toBeDefined()
        if (!backingStorageId) return;
        const storage = new BlockFindingStorage(broker, finder, backingStorage)
        const address = addresses[0]
        const result = await storage.has(address)
        expect(result).toBeTrue()
    })
    it("can find block with multiple storages", async () => {
        const [broker, finders, storages, addresses] = await setup(1, 100, 1000)
        const storage = new BlockFindingStorage(broker, finders[0], storages[0])
        for await (const address of addresses) {
            expect(await storage.has(address)).toBe(true)
        }
    })
    it("can find blocks with multiple finders", async () => {
        const [broker, finders, storages, addresses] = await setup(10, 1000, 5000)
        const storage = new BlockFindingStorage(broker, finders[0], storages[0])
        for await (const address of addresses) {
            expect(await storage.has(address)).toBe(true)
        }
    })
})

async function setup(finderCount: number, storageCount: number, blockCount: number): Promise<[BrokerClient, FindClient[], StorageClient[], string[]]> {
    const broker = mockBroker()
    const finders: FindClient[] = []
    for (let i = 0; i < finderCount; i++) {
        const finder = await findServer(broker)
        const findId = (await finder.ping())!!
        broker.registerFind(finder)
        finders.push(finder)
        finder.notify(findId)
    }
    const storages: StorageClient[] = []
    for (let i = 0; i < storageCount; i++) {
        const storage = mockStorage(broker)
        broker.registerStorage(storage)
        storages.push(storage)
    }
    const addresses: string[] = []
    for (let i = 0; i < blockCount; i++) {
        const buffers = [randomBytes(1000), randomBytes(1000)]
        const address = addressOf(buffers)
        const index = Math.floor(Math.random() * storages.length)
        const storage = storages[index]
        const storageId = (await storage.ping())!!
        await storages[index].put(address, dataFromBuffers(buffers))
        addresses.push(address)
        const finder = finders[randomInt(finders.length)]
        await finder.has(storageId, [address])
    }
    return [broker, finders, storages, addresses]
}

// Faster than crypto and it doesn't need to be a strongly random as crypto
function randomBytes(size: number): Buffer {
    const buffer = Buffer.alloc(size, 0)
    for (let i = 0; i < size; i++) {
        buffer[i] = randomInt(256)
    }
    return buffer
}

function addressOf(buffers: Buffer[]): string {
    const hash = createHash('sha256')
    for (const buffer of buffers) {
        hash.update(buffer)
    }
    return hash.digest().toString('hex')
}

function randomInt(range: number): number {
    return Math.floor(Math.random() * range)
}
