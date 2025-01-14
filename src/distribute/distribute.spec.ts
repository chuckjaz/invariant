import { mockBroker, MockBrokerClient } from "../broker/mock/mock_broker_client"
import { arr } from "../common/arr"
import { stringsToData } from "../common/data"
import { FindClient } from "../find/client"
import { findServer } from "../find/server"
import { mockStorage, MockStorageClient } from "../storage/mock"
import { Distribute } from "./distribute"

describe("distribute", () => {
    it("can create a distributor", () => {
        const broker = mockBroker()
        const distributor = new Distribute(broker)
        expect(distributor).toBeDefined()
        distributor.close()
    })
    it("can register storages", async () => {
        const [broker, storages] = await storagesAndBroker(30)
        const distributor = new Distribute(broker)
        await distributor.register(str(storages.map(s => s.id)))
        distributor.close()
    })
    it("can distribute", async () => {
        const [distributor, broker, storages, finder] = await mockDistributor(20)
        const storage = mockStorage()
        await broker.registerStorage(storage)
        const blocks = await createBlocks(storage, finder, 1000)
        await distributor.pin(str(blocks))
        await distributor.wait()
        // Verify that the storages have the blocks
        for (const block of blocks) {
            const blockCount = await count(storages, storage => storage.has(block))
            expect(blockCount).toBeGreaterThanOrEqual(3)
        }
        await distributor.close()
    })
})

async function mockDistributor(size: number): Promise<[Distribute, MockBrokerClient, MockStorageClient[], FindClient]> {
    const [broker, storages, finder] = await storagesAndBroker(size)
    const distributor = new Distribute(broker)
    await distributor.register(str(storages.map(s => s.id)))
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

async function storagesAndBroker(size: number): Promise<[MockBrokerClient, MockStorageClient[], FindClient]> {
    const broker = mockBroker()
    const storages = arr(size, i => mockStorage(broker))
    const finder = await findServer(broker)
    broker.registerFind(finder)
    for (const storage of storages) {
        broker.registerStorage(storage)
    }
    return [broker, storages, finder]
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