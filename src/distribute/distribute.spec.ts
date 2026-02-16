import { BrokerClient } from "../broker/broker_client"
import { mockBroker, MockBrokerClient } from "../broker/mock/mock_broker_client"
import { arr } from "../common/arr"
import { dataFromBuffers, stringsToData } from "../common/data"
import { error } from "../common/errors"
import { FindClient, HasListener } from "../find/client"
import { findServer } from "../find/server"
import { mockStorage, MockStorageClient } from "../storage/mock"
import { StorageClient } from "../storage/storage_client"
import { Distribute } from "./distribute"
import { randomBytes } from 'node:crypto'

describe("distribute", () => {
    it("can create a distributor", () => {
        const broker = mockBroker()
        const distributor = new Distribute(broker)
        expect(distributor).toBeDefined()
        distributor.close()
    })
    it("can register storages", async () => {
        const broker = mockBroker()
        const distributor = new Distribute(broker)
        const storages = await mockStorages(broker, [distributor], 30)
        for (const storage of storages) {
            await distributor.register(storage.id)
        }
        distributor.close()
    })
    it("can distribute", async () => {
        const [distributor, broker, storages, finder] = await mockDistributor(20)
        const storage = mockStorage(broker, [finder, distributor])
        await broker.registerStorage(storage)
        const blocks = await createBlocks(storage, finder, 1000)
        await distributor.wait()
        // Verify that the storages have the blocks
        for (const block of blocks) {
            const blockCount = await count(storages, storage => storage.has(block))
            expect(blockCount).toBeGreaterThanOrEqual(3)
        }
        await distributor.close()
    })
    it("can distribute when added to one storage", async () => {
        const blockCount = 1000
        const storeCount = 3
        const broker = mockBroker()
        const finder = await findServer(broker)
        await broker.registerFind(finder)
        const distributor = new Distribute(broker)
        try {
            const hasListeners: HasListener[] = [finder, distributor]
            const storages: StorageClient[] = []
            for (let i = 0; i < storeCount; i++) {
                const storage = mockStorage(broker, hasListeners)
                broker.registerStorage(storage)
                storages.push(storage)
            }

            // Write the blocks to a single storage
            const blocks: string[] = []
            const firstStorage = storages[0]
            for (let i = 0; i < blockCount; i++) {
                await postRandomBlock(firstStorage)
            }

            // Verify the blocks have been distributed
            for (const block of blocks) {
                const blockCount = await count(storages, storage => storage.has(block))
                expect(blockCount).toBeGreaterThanOrEqual(3)
            }

            // Verify the blocks can be found
            for (const block of blocks) {
                const containers = await findBlocks(block, broker, finder)
                expect(containers.length).toBeGreaterThanOrEqual(3)
            }
        } finally {
            await distributor.close()
        }
    })
})

async function mockDistributor(size: number): Promise<[Distribute, MockBrokerClient, MockStorageClient[], FindClient]> {
    const broker = mockBroker()
    const finder = await mockFinder(broker)
    const distributor = new Distribute(broker)
    const storages = await mockStorages(broker, [finder, distributor], size)
    for (const storage of storages) {
        await distributor.register(storage.id)
    }
    return [distributor, broker, storages, finder]
}

async function createBlocks(
    storage: MockStorageClient,
    finder: FindClient,
    size: number,
    init: (i: number) => string = i => `Item ${i}`
): Promise<string[]> {
    const ids: string[] = []
    for (let i = 0; i < size; i++) {
        const text = init(i)
        const id = await storage.post(stringsToData(text))
        if (!id) throw new Error(`Could not store ${text}`)
        ids.push(id)
    }
    await finder.has(storage.id, ids)
    return ids
}

async function mockFinder(broker: MockBrokerClient): Promise<FindClient> {
    const finder = await findServer(broker)
    broker.registerFind(finder)
    return finder
}

async function mockStorages(broker: MockBrokerClient, hasListeners: HasListener[], size: number): Promise<MockStorageClient[]> {
    const storages = arr(size, i => mockStorage(broker, hasListeners))
    for (const storage of storages) {
        broker.registerStorage(storage)
    }
    return storages
}

async function *str<T, R>(itr: Iterable<T>): AsyncIterable<T> {
    yield *itr
}

async function count<T>(items: Iterable<T>, cb: (item: T) => Promise<boolean>): Promise<number> {
    let result = 0
    for (const item of items) {
        if (await cb(item)) result++
    }
    return result
}

async function postRandomBlock(storage: StorageClient): Promise<string> {
    const dataBytes = randomBytes(2048)
    const data = dataFromBuffers([dataBytes])
    const id = await storage.post(data)
    if (!id) error("Could not write file");
    return id
}

async function findBlocks(block: string, broker: BrokerClient, finder: FindClient): Promise<string[]> {
    const results: string[] = []
    const seen = new Set<string>()

    async function doFind(finder: FindClient) {
        for await (const result of await finder.find(block)) {
            switch (result.kind) {
            case "HAS":
                results.push(result.container);
                break;
            case "CLOSER":
                if (!seen.has(result.find)) {
                    seen.add(result.find)
                    const newFinder = await broker.find(result.find)
                    if (newFinder) await doFind(newFinder)
                }
                break
            }
        }
    }

    const id = await finder.ping()
    if (id) {
        seen.add(id)
        await doFind(finder)
    }

    return results
}