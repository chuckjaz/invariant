import Koa from 'koa'
import { readFile, writeFile } from 'node:fs/promises'
import * as path from 'node:path'
import { fileExists } from '../../common/files'
import { randomBytes } from 'node:crypto'
import { idAndPrivate, idMiddle } from '../../common/id'
import { BROKER_URL, registerWithBroker, SERVER_URL } from '../../common/register'
import { delay } from '../../common/delay';
import { normalizeCode } from '../../common/codes';
import { BrokerGetResponse, BrokerServiceQueryResponse, FindResponse } from '../../common/types';
import { safeaParseJson as safeParseJson } from '../../common/parseJson'
import { WorkQueue } from '../../common/work_queue'

const findPath = path.join(__dirname, '.find')
const app = new Koa()
export default app
const port = 3002
let myId: Buffer
let broker: Broker

interface Container {
    id: string
    kind: string
    has: Set<string>
}

interface PersistentInformation {
    id: string
    kind: string
    has: string[]
}

const info = new Map<string, Container>()
const has = new Map<string, Set<string>>()
const finders: string[][] = []

const findGetPrefix = '/find/'
const findPutPrefx = '/put'

app.use(async function (ctx,  next) {
    if (ctx.path.startsWith(findGetPrefix) && ctx.method == 'GET') {
        const id = normalizeCode(ctx.path.slice(findGetPrefix.length))
        if (id) {
            const result: FindResponse = []
            const containers = has.get(id)
            if (containers) {
                for (const container of containers) {
                    result.push({ kind: "HAS", id: container})
                }
            }
            const closer = findServersCloserTo(id)
            for (const id of closer) {
                result.push({ kind: "CLOSER", id })
            }
            ctx.body = result
            return
        }
    }
    await next()
})

function bucketIndexOf(id: string): number {
    const idBits = Buffer.from(id, 'hex')
    for (let index = 0; index < 32 * 8; index++) {
        const myBit =  myId.at(Math.floor(index / 8))!! >> index % 8
        const idBit = idBits.at(Math.floor(index / 8))!! >> index % 8
        if (myBit != idBit) return index
    }
    return 256
}

function addFindServer(id: string) {
    const bucketIndex = bucketIndexOf(id)
    let bucket = finders[bucketIndex]
    if (!bucket) {
        bucket = []
        finders[bucketIndex] = bucket
    }
    if (bucket.length < 40) {
        bucket.push(id)
    }
}

function recordHas(id: string, container: string) {
    const entry = info.get(container)
    if (entry) {
        entry.has.add(id)
    }
    let bucket = has.get(id)
    if (!bucket) {
        bucket = new Set<string>()
        has.set(id, bucket)
    }
    bucket.add(container)
}

function findServersCloserTo(id: string, count: number = 20): string[] {
    const bucketIndex = bucketIndexOf(id)
    const result: string[] = []
    let currentIndex = bucketIndex
    while (result.length < count && currentIndex >= 0) {
        const bucket = finders[currentIndex--] ?? []
        const effectiveLength = bucket.length > count ? count : bucket.length
        const needed = result.length - count
        const adding = needed > effectiveLength ? effectiveLength : needed
        result.push(...bucket.slice(0, adding))
    }
    return result
}

let saving = false
let lastSaved = Date.now()
const duration = 1000 * 5

async function save() {
    if (saving) return
    const now = Date.now()
    saving = true
    try {
        const timeTillNextSave = lastSaved + duration
        const timeToWait = timeTillNextSave - now
        if (timeToWait > 0) await delay(timeToWait)

        const data: PersistentInformation[] = []
        for (const entry of info.values()) {
            data.push({ id: entry.id, kind: entry.kind, has: Array.from(entry.has) })
        }
        const result = JSON.stringify(data)
        await writeFile(findPath, result, 'utf-8')
        lastSaved = Date.now()
    } finally {
        saving = false
    }
}

function newContainer(id: string, kind: string): Container {
    const result: Container =  { id, kind, has: new Set()}
    info.set(id, result)
    return result
}

async function restore() {
    if (await fileExists(findPath)) {
        const text = await readFile(findPath, 'utf8')
        const result = JSON.parse(text) as PersistentInformation[]
        for (const persistentContainer of result) {
            let container = info.get(persistentContainer.id) ??
                newContainer(persistentContainer.id, persistentContainer.kind)
            persistentContainer.has.forEach(id => {
                recordHas(id, container.id)
            });
            if(container.kind == "find") {
                addFindServer(container.id)
            }
        }
    }
}

interface ServerInformation {
    id: string
    url: string
    lastValidated?: number
    token?: string
    ttl?: number
}

const serverCache = new Map<string, ServerInformation>()

class Broker {
    url: string
    private infoCache: Map<string, ServerInformation>

    constructor(url: string) {
        this.url = url
        this.infoCache = new Map()
    }

    async urlOf(id: string): Promise<string | undefined> {
        return (await this.collectInfoFor(id))?.url
    }

    async findServers(kind: string): Promise<ServerInformation[]> {
        const serverIds = (await this.reqJson(`/broker/servers/${kind}`) as string[]) ?? []
        const resolve = await Promise.all(serverIds.map(id => this.collectInfoFor(id)))
        return resolve.filter(value => value) as ServerInformation[]
    }

    private async collectInfoFor(id: string): Promise<ServerInformation | undefined> {
        if (this.infoCache.has(id)) {
            return this.infoCache.get(id)
        }
        const info = await this.reqJson(`/broker/location`) as BrokerGetResponse
        if (info) {
            this.infoCache.set(id, { id, url: info.url, token: info.token, ttl: info.ttl })
            return info
        }
    }

    private async reqText(path: string): Promise<string | undefined> {
        const requestUrl = new URL(path, this.url)
        const response = await fetch(requestUrl)
        if (response.status == 200) {
            return await response.text()
        }
    }

    private async reqJson(path: string): Promise<any> {
        const text = await this.reqText(path)
        if (text) {
            return safeParseJson(text)
        }
    }
}


const findQueue = new WorkQueue<string>()

// async function find(idToFind: string): Promise<string[]> {
//     const checked = new Set<string>()
//     const toCheck = findServersCloserTo(idToFind)
//     let found = false
// }

async function backgroundResolver() {
    while (true) {
        const idToFind = await findQueue.pop()
        if (has.has(idToFind)) {
            // We already know abou this one
            continue
        }

        // See if any closer servers we know know about this.
        const closer = findServersCloserTo(idToFind)
        const checked = new Set<string>()
        var found = false

        for (const server of closer) {
            if (checked.has(server)) continue
            checked.add(server)
            const serverUrl = await broker.urlOf(server)
            const requestUrl = new URL(`/find:${idToFind}`, serverUrl)
            const response = await fetch(requestUrl)
            if (response.status == 200) {
                const responseText = await response.text()
                const json = safeParseJson(responseText) as FindResponse
                if (json) {
                    for (const item of json) {
                        switch (item.kind) {
                            case "HAS":
                                recordHas(idToFind, item.id)
                                found = true
                                break
                            case "CLOSER":
                                addFindServer(item.id)
                                closer.push(item.id)
                                break
                        }
                    }
                }
            }
        }
        if (found) continue

        // Check the broker registered storage servers directly
        const storageServers = await broker.findServers('storage')
        const responses = storageServers.map(server => {
            const requestUrl = new URL(`/storage/sha256/${idToFind}`)
            return { promise: fetch(requestUrl, { method: 'HEAD' }), id: server.id}
        })
        for (const responsePromise of responses) {
            const response = await responsePromise.promise
            if (response.status == 200) {
                recordHas(idToFind, responsePromise.id)
            }
        }
    }
}
async function startup() {
    await restore()
    myId = (await idAndPrivate(__dirname, async () => ({ id: randomBytes(32) }))).id

    const idText = myId.toString('hex')
    app.use(idMiddle(idText))
    const brokerResponse = await registerWithBroker(idText, 'find')
    if (!brokerResponse) {
        console.error(`Could not find broker, please set environment variable ${BROKER_URL} and ${SERVER_URL}`)
        process.exit(1)
    }
    broker = new Broker(brokerResponse.url)

    // Find all the find servers in the broker
    const findServers = await broker.findServers('find')
    for (const findServer of findServers) {
        if (findServer.id != idText) {
            addFindServer(findServer.id)
        }
    }

    // Start the verify ids loop
    console.log("Fully started")
}


if (!module.parent) {
    app.listen(port)
    startup().catch(e => console.error(e))
    console.log(`Find listening on localhost:${port}`)
}
