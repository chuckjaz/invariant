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
import { dataFromBuffers, stringsToData } from '../../common/data'
import { Logger } from '../../common/web'

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
    it("can pin blocks", async () => {
        await distributeAndStorages(async (client, { distribute, blocks, logger }) => {
            await client.pin(take(10, stringStream(...blocks)))
            await distribute.wait()
            const pinning = logger.logs.map(l => (l.message.indexOf('PINNING') >= 0 ? 1 : 0) as number).reduce((p, c) => p + c)
            expect(pinning).toEqual(10)
        })
    })
    it("can unpin blocks", async () => {
        await distributeAndStorages(async (client, { distribute, blocks, logger }) => {
            await client.unpin(take(10, stringStream(...blocks)))
            await distribute.wait()
            const pinning = logger.logs.map(l => (l.message.indexOf('UNPINNING') >= 0 ? 1 : 0) as number).reduce((p, c) => p + c)
            expect(pinning).toEqual(10)
        })
    })
    it("can register storage servers", async () => {
        await distributeAndStorages(async (client, { distribute, storageIds, logger }) => {
            await client.register(stringStream(...storageIds))
            await distribute.wait()
            const registered = logger.logs.map(l => (l.message.indexOf('REGISTERING') >= 0 ? 1 : 0) as number).reduce((p, c) => p + c)
            expect(registered).toEqual(storageIds.length)
        })
    })
    it("can unregister storage servers", async () => {
        await distributeAndStorages(async (client, { distribute, storageIds, logger }) => {
            await client.unregister(stringStream(...storageIds))
            await distribute.wait()
            const registered = logger.logs.map(l => (l.message.indexOf('UNREGISTERING') >= 0 ? 1 : 0) as number).reduce((p, c) => p + c)
            expect(registered).toEqual(storageIds.length)
        })
    })
    it("can get blocks", async () => {
        await distributeAndStorages(async (client, { distribute, storageIds, blocks}) => {
            await client.register(stringStream(...storageIds))
            await client.pin(stringStream(...blocks))
            await distribute.wait()
            let count = 0
            for await (let block of client.blocks(stringStream(...blocks))) {
                expect(block.storages.length).toBeGreaterThanOrEqual(3)
                count++
            }
            expect(count).toBeGreaterThan(1)
        })
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
    }) => Promise<void>
) {
    const broker = mockBroker()
    const storages: StorageClient[] = []
    const storageIds: string[] = []
    const blocks: string[] = []
    for (let i = 0; i < 10; i++) {
        const storage = mockStorage(broker)
        const storageId = await storage.ping()
        if (!storageId) error("Ping failed")
            storageIds.push(storageId)
        broker.registerStorage(storage)
        storages.push(storage)
        for (let i = 0; i < 10; i++) {
            const data = randomBytes(1000)
            const block = await storage.post(dataFromBuffers([data]))
            if (!block) {
                error("Post failed")
            }
            blocks.push(block)
        }
    }
    const finder = await findServer(broker)
    broker.registerFind(finder)
    const id = randomId()
    const logger = mockLogger()
    const distribute = new Distribute(broker, id, 3, finder, logger.logger)
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
        await block(client, {distribute, broker, storages, storageIds, blocks, finder, id, logger })
    } finally {
        server.close()
        await distribute.close()
    }
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
        logs.push({ message, kind, request })
    }
    return { logger, logs }
}