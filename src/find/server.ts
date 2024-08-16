import { BrokerClient } from "../broker/client"
import { randomBytes } from 'node:crypto'
import { FindClient, FindResult, FindResultItem } from "./client"
import { Channel } from "../common/channel"
import { ParallelMapper } from "../common/parallel_mapper"

export interface FindServerOptions {
    parallelism?: number
    channelSize?: number
    queryDelay?: number
    now?: () => number
    startAwaiter: (promise: Promise<void>) => Promise<void>
}

async function defaultStartAwaiter(promise: Promise<void>): Promise<void> {
    promise.catch(e => console.error('findServer:start', e))
}

const defaultOptions = { parallelism: 20, queryDelay: 60 * 1000, now: Date.now, startAwaiter: defaultStartAwaiter }

export async function findServer(broker: BrokerClient, _options?: FindServerOptions): Promise<FindClient> {
    const options = { ...defaultOptions, ...(_options ?? { }) }
    const myId = randomBytes(32)
    const textId = myId.toString('hex')
    const finds: string[][] = []
    const have = new Map<string, Set<string>>()
    let lastBrokerQuery = 0

    async function ping(): Promise<boolean> {
        return true
    }

    async function find(id: string): Promise<FindResult> {
        const channel = new Channel<FindResultItem>(options.channelSize)
        async function doFind() {
            try {
                const known = have.get(id)
                if (known) {
                    for (const container of known.values()) {
                        await channel.send({ kind: "HAS", container })
                        if (channel.closed) return
                    }
                    return
                }

                // Collect find servers know about the
                const now = options.now()
                if (lastBrokerQuery + options.queryDelay < now) {
                    lastBrokerQuery = now
                    const findServerIds = await broker.registered('find')
                    for await (const findId of findServerIds) {
                        addFindServer(findId)
                    }
                }

                if (channel.closed) return

                const closer = findServersCloserTo(id)
                for (const find of closer) {
                    await channel.send({ kind: 'CLOSER', find })
                    if (channel.closed) return
                }
            } finally {
                channel.close()
            }
        }
        doFind()
        return channel.all()
    }

    async function has(container: string, ids: string[]): Promise<void> {
        const newIds = recordHas(container, ...ids)
        if (newIds.length > 0) {
            const map = new ParallelMapper<{ findId: string, id: string }, void>(async ({ findId, id }) => {
                const findServer = await broker.find(findId)
                if (findServer)
                    await findServer.has(container, [id])
            })
            for (const id of newIds) {
                const closer = findServersCloserTo(id)
                for (const findId of closer) {
                    map.add({ findId, id})
                }
            }
            await map.collect()
        }
    }

    async function notify(find: string): Promise<void> {
        addFindServer(find)
    }

    function addFindServer(id: string) {
        const bucketIndex = bucketIndexOf(myId, id)
        let bucket = finds[bucketIndex]
        if (!bucket) {
            bucket = []
            finds[bucketIndex] = bucket
        }
        if (bucket.length < 40) {
            bucket.push(id)
        }
    }

    function findServersCloserTo(id: string, count: number = 20): string[] {
        const bucketIndex = bucketIndexOf(myId, id)
        const result: string[] = []
        let currentIndex = bucketIndex
        while (result.length < count && currentIndex < finds.length) {
            const bucket = finds[currentIndex++]
            if (!bucket) continue
            const effectiveLength = bucket.length > count ? count : bucket.length
            const needed = count - result.length
            const adding = needed > effectiveLength ? effectiveLength : needed
            result.push(...bucket.slice(0, adding))
        }
        currentIndex = bucketIndex - 1
        while (result.length < count && currentIndex >= 0) {
            const bucket = finds[currentIndex--]
            if (!bucket) continue
            const effectiveLength = bucket.length > count ? count : bucket.length
            const needed = count - result.length
            const adding = needed > effectiveLength ? effectiveLength : needed
            result.push(...bucket.slice(0, adding))
        }
        return result
    }

    function recordHas(container: string, ...ids: string[]): string[] {
        const newIds: string[] = []
        for (const id of ids) {
            let bucket = have.get(id)
            if (!bucket) {
                bucket = new Set<string>()
                have.set(id, bucket)
            }
            if (!bucket.has(container)) {
                bucket.add(container)
                newIds.push(id)
            }
        }
        return newIds
    }

    async function containerOf(id: string): Promise<string | undefined> {
        for await (const entry of await find(id)) {
            if (entry.kind == "HAS") return entry.container
        }
    }

    async function start(): Promise<void> {
        // Record that our broker has us.
        recordHas(broker.id, textId)

        async function initializeFindServerInfo(): Promise<void> {
            lastBrokerQuery = options.now()

            // Get the find servers from our broker
            let find: FindClient | undefined = undefined
            for await (const entry of await broker.registered('find')) {
                if (entry == textId) continue
                addFindServer(entry)
                if (!find) {
                    find = await broker.find(entry)
                }
                recordHas(broker.id, entry)
            }

            if (find) {
                await find.notify(textId)
                // Ask the first find server for the closes find servers to us.
                for await (const entry of await find.find(textId)) {
                    if (entry.kind == "CLOSER") {
                        addFindServer(entry.find)
                        // Tell the other find server about this server
                        const find = await broker.find(entry.find)
                        if (find) {
                            await find.notify(textId)
                        }
                    }
                }
            }
        }

        async function initializeStorageServerInfo(): Promise<void> {
            for await (const entry of await broker.registered('storage')) {
                recordHas(broker.id, entry)
            }
        }

        const findInit = initializeFindServerInfo()
        const storageInit = initializeStorageServerInfo()
        await findInit
        await storageInit
    }

    await options.startAwaiter(start())

    return {
        id: textId,
        ping,
        find,
        has,
        notify,
    }
}

function bucketIndexOf(myId: Buffer, id: string): number {
    const idBits = Buffer.from(id, 'hex')
    for (let index = 0; index < 256; index++) {
        const myBit =  myId.at(index >> 3)!! >> index % 8
        const idBit = idBits.at(index >> 3)!! >> index % 8
        if (myBit != idBit) return index
    }
    return 256
}
