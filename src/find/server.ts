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
}

const defaultOptions = { parallelism: 20, queryDelay: 60 * 1000, now: Date.now }

export function findServer(broker: BrokerClient, _options?: FindServerOptions): FindClient {
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
            const known = have.get(id)
            if (known) {
                for (const container of known.values()) {
                    await channel.send({ kind: "HAS", container })
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

            // Check other find servers
            const checked = new Set(textId)
            const sent = new Set<string>()
            const map = new ParallelMapper<string, void>(async (findId, schedule) => {
                if (channel.closed || checked.has(findId)) return
                checked.add(findId)
                const findServer = await broker.find(findId)
                if (findServer) {
                    const results = await findServer.find(id)
                    if (channel.closed) return
                    for await (const result of results) {
                        if (channel.closed) break
                        switch (result.kind) {
                            case "HAS":
                                if (!sent.has(result.container)) {
                                    sent.add(result.container)
                                    await channel.send(result)
                                }
                                break
                            case "CLOSER":
                                if (!checked.has(result.find)) {
                                    addFindServer(result.find)
                                    schedule(result.find)
                                    await channel.send(result)
                                }
                                break
                        }
                    }
                }
            })
            map.add(...findServersCloserTo(id))
            await map.collect()            
        }
        doFind()
        return channel.all()
    }

    async function has(container: string, ids: string[]): Promise<void> {
        recordHas(container, ...ids)
        const map = new ParallelMapper<{ findId: string, id: string }, void>(async ({ findId, id }) => {
            const findServer = await broker.find(findId)
            if (findServer)
                await findServer.has(container, [id])
        })
        for (const id of ids) {
            const closer = findServersCloserTo(id)
            for (const findId of closer) {
                map.add({ findId, id})
            }
        }
        await map.collect()
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
            const needed = result.length - count
            const adding = needed > effectiveLength ? effectiveLength : needed
            result.push(...bucket.slice(0, adding))
        }
        currentIndex = bucketIndex - 1
        while (result.length < count && currentIndex >= 0) {
            const bucket = finds[currentIndex--]
            if (!bucket) continue
            const effectiveLength = bucket.length > count ? count : bucket.length
            const needed = result.length - count
            const adding = needed > effectiveLength ? effectiveLength : needed
            result.push(...bucket.slice(0, adding))
        }
        return result
    }

    function recordHas(container: string, ...ids: string[]) {
        for (const id of ids) {
            let bucket = have.get(id)
            if (!bucket) {
                bucket = new Set<string>()
                have.set(id, bucket)
            }
            bucket.add(container)
        }
    }

    return {
        id: textId,
        ping,
        find,
        has,
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
