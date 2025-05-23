import * as path from 'path'
import { readFile, writeFile } from 'fs/promises'
import { randomId } from "../../common/id";
import { BrokerLocationResponse, BrokerRegisterResponse } from "../../common/types";
import { firstLive, verifyLive } from "../../common/verify";
import { BrokerServer } from "../broker_server";
import { fileExists } from '../../common/files';
import { delay } from '../../common/delay';

interface Information {
    id: string
    urls: string[]
    kind?: string
    lastVerified: number
}

export class LocalBrokerServer implements BrokerServer {
    private infoPath?: string
    private id: string
    private info = new Map<string, Information>()

    constructor(directory?: string, id: string = randomId()) {
        this.id = id
        if (directory) {
            this.infoPath = path.join(directory, '.broker')
        }
        if (this.infoPath) {
            this.restore().catch(e => console.error("Broker could not load previous data", e))
        }
        this.verifyIds().catch(e => console.error("Broker no longer verifying ids", e))
    }

    stop() {
        this.running = false
    }

    async ping(): Promise<string> {
        return this.id
    }

    async location(id: string): Promise<BrokerLocationResponse | undefined> {
        const info = this.info.get(id)
        if (info) {
            this.validateId(id)
            return { id, urls: info.urls }
        }
        return undefined
    }

    async register(id: string, urls: URL[], kind?: string): Promise<BrokerRegisterResponse | undefined> {
        const existingInfo = this.info.get(id)
        if (existingInfo) {
            existingInfo.kind = kind
            existingInfo.urls = urls.map(u => u.toString())
            existingInfo.lastVerified = 0
        } else {
            this.info.set(id, { id, kind, urls: urls.map(u => u.toString()), lastVerified: 0 })
        }
        return { id }
    }

    async *registered(kind: string): AsyncIterable<string> {
        for (const [id, info] of this.info) {
            if (info.kind == kind)
                yield id
        }
    }

    private validateId(id: string) {
        const that = this
        const entry = this.info.get(id) as Information
        async function validate() {
            const liveUrl = await firstLive(entry.urls, entry.id)
            if (!liveUrl) {
                console.log("Deleting", id, "as it is not responding on any of", entry.urls)
                that.info.delete(id)
                that.save().catch(e => console.error(e))
            } else {
                entry.lastVerified = Date.now()
            }
        }
        if (entry) {
            validate().catch(e => console.error(e))
        }
    }

    async verifyIds() {
        // // Every 5 to 10 seconds validate an id that has not been validated in the last 60 seconds
        // while (this.running) {
        //     await delay(nextInt(5000, 5000))
        //     const ids = Array.from(this.info.keys())
        //     const id = ids[nextInt(ids.length)]
        //     const entry = this.info.get(id)
        //     const now = Date.now()
        //     if (entry && ((entry.lastVerified ?? 0) + 60 * 1000) < now) {
        //         entry.lastVerified = now
        //         this.validateId(id)
        //     }
        // }
    }

    private running = true
    private saving = false
    private lastSaved = Date.now()

    async restore() {
        const infoPath = this.infoPath
        if (infoPath && await fileExists(infoPath)) {
            const text = await readFile(infoPath, 'utf8')
            const result = JSON.parse(text) as Information[]
            for (const entry of result) {
                if (!this.info.has(entry.id)) {
                    this.info.set(entry.id, entry)
                }
            }
        }
    }

    private async save() {
        if (this.saving) return
        const infoPath = this.infoPath
        if (!infoPath) return
        const now = Date.now()
        this.saving = true
        try {
            const timeTillNextSave = this.lastSaved + duration
            const timeToWait = timeTillNextSave - now
            if (timeToWait > 0) await delay(timeToWait)

            const data: Information[] = []
            for (const entry of this.info.values()) {
                data.push(entry)
            }
            const result = JSON.stringify(data)
            await writeFile(infoPath, result, 'utf-8')
            this.lastSaved = Date.now()
        } finally {
            this.saving = false
        }
    }
}

const duration = 1000 * 5

function nextInt(range: number, offset?: number) {
    return Math.floor((offset ?? 0) + Math.random() * range)
}
