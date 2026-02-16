import Koa from 'koa'
import { BrokerClient } from "../../broker/broker_client"
import { mockBroker } from "../../broker/mock/mock_broker_client"
import { randomId } from "../../common/id"
import { FindClient } from "../../find/client"
import { findServer } from "../../find/server"
import { mockStorage } from "../../storage/mock"
import { StorageClient } from "../../storage/storage_client"
import { Distribute } from "../distribute"
import { DistributeWebClient } from "./distribute_web_client"
import { distributeHandlers } from "./distribute_web_handlers"
import { error, invalid } from '../../common/errors'
import { dataFromBuffers } from '../../common/data'
import { Logger } from '../../common/web'
import { withTmpDir } from '../../common/test_tmp'
import { LocalStorage } from '../../storage/local/local_storage'
import { storageHandlers } from '../../storage/web/storage_web_handlers'
import { StorageWebClient } from '../../storage/web/storage_web_client'
import { DistributeClient } from '../distribute_client'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 300000

describe('distribute/web', () => {
    it("can create a distribute client", () => {
        const url = new URL('http://localhost:8080')
        const client = new DistributeWebClient(url)
        expect(client).toBeDefined()
    })
    it("can create a distribute handler", () => {
        const broker = mockBroker()
        const distribute = new Distribute(broker)
        const handlers = distributeHandlers(distribute)
        expect(handlers).toBeDefined()
    })
    it("can ping the server", async () => {
        await distributeAndStorages(async (client, { id }) => {
            const pinged = await client.ping()
            expect(pinged).toEqual(id)
        })
    })
    it("can register storage servers", async () => {
        await distributeAndStorages(async (client, { distribute, storageIds, logger }) => {
            for (const storage of storageIds) {
                await client.register(storage)
            }
            await distribute.wait()
            const registered = logger.logs.map(l => (l.message.indexOf('REGISTERING') >= 0 ? 1 : 0) as number).reduce((p, c) => p + c)
            expect(registered).toEqual(storageIds.length)
        })
    })
    it("can unregister storage servers", async () => {
        await distributeAndStorages(async (client, { distribute, storageIds, logger }) => {
            for (const storageId of storageIds) {
                await client.unregister(storageId)
            }
            await distribute.wait()
            const registered = logger.logs.map(l => (l.message.indexOf('UNREGISTERING') >= 0 ? 1 : 0) as number).reduce((p, c) => p + c)
            expect(registered).toEqual(storageIds.length)
        })
    })
    it("can get blocks", async () => {
        await distributeAndStorages(async (client, { distribute, storageIds, blocks }) => {
            for (const storageId of storageIds) {
                await client.register(storageId)
            }
            await distribute.wait()
            let count = 0
            for (const storage of storageIds) {
                for (const block of blocks) {
                    if (await client.needed(storage, block)) count++;
                }
            }
            expect(count).toBeGreaterThan(1)
        })
    })
    it("can redistribute blocks on startup", async () => {
        await distributeAndStorages(async (client, { distribute, storages, storageIds }) => {
            // Create a bunch of random blocks to the first storage
            const storage = storages[0]
            if (!storage) error("Couldn't find storage");
            const blocks: string[] = []
            for (let i = 0; i < 100; i++) {
                const data = randomBytes(1000)
                const block = await storage.post(dataFromBuffers([data]))
                if (!block) error(`Couldn't upload block: ${block}`);
                blocks.push(block)
            }

            // Register the storages to the distribute server
            for (const storage of storageIds) {
                await distribute.register(storage)
            }

            // Wait for the distributor to complete all tasks
            await distribute.wait()

            // Check the storages for for the blocks
            for (const block of blocks) {
                let count = 0
                for (const storage of storages) {
                    if (await storage.has(block)) {
                        count++
                    }
                }
                expect(count).toBeGreaterThan(2)
            }
        }, 10, 0)
    })
    it("can redistribute blocks as they are written", async () => {
        await distributeAndStorages(async (client, { distribute, storages, storageIds, finder }) => {
            // Register the storages to the distribute server
            for (const storage of storageIds) {
                await distribute.register(storage)
            }

            // Write blocks to one of the storage servers
            const storage = storages[0]
            if (!storage) error("Couldn't find storage");
            const blocks: string[] = []
            for (let i = 0; i < 100; i++) {
                const data = randomBytes(1000)
                const block = await storage.post(dataFromBuffers([data]))
                if (!block) error(`Couldn't upload block: ${block}`);
                blocks.push(block)
            }

            // Wait for the distributor to complete all tasks
            await distribute.wait()

            // Check the storages for for the blocks
            for (const block of blocks) {
                let count = 0
                for (const storage of storages) {
                    if (await storage.has(block)) {
                        count++
                    }
                }
                expect(count).toBeGreaterThan(2)
            }

            // Finder can find them in their new locations
            for (const block of blocks) {
                const found = await findInFinder(finder, block)
                expect(found.size).toBeGreaterThan(2)
            }
        }, 10, 0)
    })
    it("can redistribute blocks with a local web client", async () => {
        await distributeWithLocalStorage(async ({ distribute, storages, blocks, logger }) => {
            await distribute.wait()

            // Check the existing blocks
            for (const block of blocks) {
                let count = 0
                for (const storage of storages) {
                    if (await storage.has(block)) {
                        count++
                    }
                }
                expect(count).toBeGreaterThan(2)
            }

            // Write blocks round-robin to the storages
            for (let i = 0; i < 10; i++) {
                const buffer = randomBytes(1000)
                const address = await storages[i % storages.length].post(dataFromBuffers([buffer]))
                if (!address) error("Could not write block");
                blocks.push(address)
            }

            await distribute.wait()

            // Check the existing blocks
            for (const block of blocks) {
                let count = 0
                for (const storage of storages) {
                    if (await storage.has(block)) {
                        count++
                    }
                }
                expect(count).toBeGreaterThan(2)
            }
        }, 10, 1)
    })
})

async function distributeAndStorages(
    block: (client: DistributeWebClient, services: {
        distribute: Distribute,
        broker: BrokerClient,
        storages: StorageClient[],
        storageIds: string[],
        blocks: string[],
        finder: FindClient,
        id: string,
        logger: MockLogger
    }) => Promise<void>,
    serverCount: number = 10,
    blockPerServerCount: number = 10,
) {
    const broker = mockBroker()
    const storages: StorageClient[] = []
    const storageIds: string[] = []
    const blocks: string[] = []
    const finder = await findServer(broker)
    broker.registerFind(finder)
    const id = randomId()
    const logger = mockLogger()
    const distribute = new Distribute(broker, id, 3, finder, logger.logger)
    for (let i = 0; i < serverCount; i++) {
        const storage = mockStorage(broker, [distribute])
        const storageId = await storage.ping()
        if (!storageId) error("Ping failed")
            storageIds.push(storageId)
        broker.registerStorage(storage)
        storages.push(storage)
        for (let i = 0; i < blockPerServerCount; i++) {
            const data = randomBytes(1000)
            const block = await storage.post(dataFromBuffers([data]))
            if (!block) {
                error("Post failed")
            }
            blocks.push(block)
        }
    }
    const handler = distributeHandlers(distribute)
    const app = new Koa()
    app.use(handler)
    const server = app.listen()
    try {
        const address = server.address()
        if (address == null || typeof address !== 'object') {
            invalid('Expected an object type from server.address()')
        }
        const url = new URL(`http://localhost`)
        url.port = address.port.toString()
        const client = new DistributeWebClient(url)
        await block(client, { distribute, broker, storages, storageIds, blocks, finder, id, logger })
    } finally {
        server.close()
        await distribute.close()
    }
}

async function distributeWithLocalStorage(
    block: (services: {
        distribute: Distribute,
        broker: BrokerClient,
        storages: StorageClient[],
        storageIds: string[],
        blocks: string[],
        id: string,
        logger: MockLogger,
    }) => Promise<void>,
    serverCount: number = 10,
    blockPerServerCount: number = 10,
) {
    const broker = mockBroker()
    const storages: StorageClient[] = []
    const storageIds: string[] = []
    const blocks: string[] = []
    const finder = await findServer(broker)
    await broker.registerFind(finder)
    const id = randomId()
    const logger = mockLogger()
    const distribute = new Distribute(broker, id, 3, finder, logger.logger)
    const closers: (() => void)[] = []
    try {
        await withTmpDir(async (directory: string) => {
            logger.logger(`DIRECTORY: ${directory}`)
            const values = [237, 184, 200]
            for (let j = 0; j < serverCount; j++) {
                const id = randomId()
                const [storage, closer] = await localWebStorage(
                    `${directory}/storage${j}`,
                    id,
                    distribute,
                    broker,
                )
                closers.push(closer)
                storages.push(storage)
                await broker.registerStorage(storage)
                for (let i = 0; i < blockPerServerCount; i++) {
                    const data = Buffer.from([values[j % values.length]])
                    logger.logger(`POST: ${j}:${i}:${data[0].toString(16)} to ${id}`)
                    const block = await storage.post(dataFromBuffers([data]))
                    if (!block) {
                        error("POST: failed")
                    }
                    blocks.push(block)
                }
                await distribute.register(id)
            }

            await block({ distribute, broker, storages, storageIds, blocks, id, logger })
        })
    } finally {
        await distribute.close()
        for (const closer of closers) closer();
    }
}

async function localWebStorage(
    directory: string,
    id: string,
    distribute: DistributeClient,
    broker: BrokerClient,
): Promise<[StorageClient, () => void]> {
    const localStorageClient = new LocalStorage(directory, id, [distribute])
    const handler = storageHandlers(localStorageClient, broker)
    const app = new Koa()
    app.use(handler)
    const server = app.listen()
    const address = server.address()
    if (address == null || typeof address !== 'object') {
        invalid('Expected an object type from server.address()')
    }
    const url = new URL(`http://localhost`)
    url.port = address.port.toString()
    const webStorage = new StorageWebClient(url)
    return [webStorage, server.close.bind(server)]
}

function randomBytes(size: number): Buffer {
    const buffer = Buffer.alloc(size, 0)
    for (let i = 0; i < size; i++) {
        buffer[i] = randomInt(256)
    }
    return buffer
}

function randomInt(range: number): number {
    return Math.floor(Math.random() * range)
}

async function * stringStream(...strings: string[]): AsyncIterable<string> {
    yield *strings
}

async function * take(count: number, strings: AsyncIterable<string>): AsyncIterable<string> {
    let i = 0
    for await (let item of strings) {
        if (i >= count) break
        i++
        yield item
    }
}

interface MockLog {
    message: string
    kind?: string
    request?: number
}

interface MockLogger {
    logger: Logger
    logs: MockLog[]
}

function mockLogger(): MockLogger {
    const logs: MockLog[] = []
    const logger = async (message: string, kind?: string, request?: number) => {
        const msg: any = { message }
        if (kind) msg.kind = kind
        if (request) msg.request = request
        logs.push(msg)
    }
    return { logger, logs }
}

async function findInFinder(finder: FindClient, block: string): Promise<Set<string>> {
    const result = new Set<string>()
    for await (const findResult of await finder.find(block)) {
        if (findResult.kind == "HAS") {
            result.add(findResult.container)
        }
    }
    return result
}