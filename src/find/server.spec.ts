import { BrokerClient } from "../broker/client"
import { mockBroker, MockBrokerClient } from "../broker/mock/client"
import { delay } from "../common/delay"
import { FindClient, FindResult } from "./client"
import { findServer as rawFindServer } from "./server"
import { randomBytes } from 'node:crypto'

function findServer(broker: BrokerClient): Promise<FindClient> {
    return rawFindServer(broker, { startAwaiter: p => p })
}

describe('find/server', () => {
    it('can create a find server', async () => {
        const broker = mockBroker()
        const find = await findServer(broker)
        expect(find).toBeDefined()
    })
    it('a find server can find itself', async () => {
        const broker = mockBroker()
        const find = await findServer(broker)
        const servers = (await allOf(await find.find(find.id))).filter(e => e.kind == "HAS")
        expect(servers).toContain({ kind: "HAS", container: broker.id})
    })
    it('can tell a find server about a container and item', async () => {
        const broker = mockBroker()
        const find = await findServer(broker)
        const container = someId()
        const item = someId()
        await find.has(container, [item])
        const result = await allOf(await find.find(item))
        expect(result).toContain({ kind: 'HAS', container })
    })
    it('can tell one finder about it and another finder will be able to find it', async () => {
        const broker = mockBroker()
        const finders = await findServers(broker, 100)
        const first = finders[0]
        const container = someId()
        const item = someId()
        await delay(10)
        await first.has(container, [item])
        for (const finder of finders) {
            const result = await findFirst(broker, finder, item)
            expect(result).toEqual(container)
        }
    })
})

async function allOf<T>(entries: AsyncIterable<T>): Promise<T[]> {
    const result: T[] = []
    for await (const entry of entries) {
        result.push(entry)
    }
    return result
}

function someId(): string {
    return randomBytes(32).toString('hex')
}

async function findServers(broker: MockBrokerClient, count: number): Promise<FindClient[]> {
    const result: FindClient[] = []
    for (let i = 0; i < count; i++) {
        const find = await findServer(broker)
        broker.registerFind(find)
        result.push(find)
    }
    return result
}

async function findFirst(broker: BrokerClient, find: FindClient, id: string): Promise<string | undefined> {
    const tried = new Set<string>()
    const toTry: FindClient[] = [find]

    while (toTry.length > 0) {
        const find = toTry.shift()!!
        tried.add(find.id)
        for await (const entry of await find.find(id)) {
            switch (entry.kind) {
                case "CLOSER": {
                    if (!tried.has(entry.find)) {
                        const newFind = await broker.find(entry.find)
                        if (newFind) toTry.push(newFind)
                        else console.log('findFirst could get a client for', entry.find)
                    }
                    break
                }
                case "HAS": {
                    return entry.container
                }
            }
        }
    }
}