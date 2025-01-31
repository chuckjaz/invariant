import { fileExists } from "../../common/files";
import { randomId } from "../../common/id";
import { LookupResult, NamesClient } from "../names_client";
import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import { invalid } from "../../common/errors";
import { normalizeCode } from "../../common/codes";

interface NameRecord {
    name: string
    address: string
    ttl: number
}

export class LocalNamesServer implements NamesClient {
    id: string
    directory: string
    map?: Map<string, NameRecord>

    constructor (directory: string, id?: string) {
        this.id = id ?? randomId()
        this.directory = directory
    }

    async ping(): Promise<string> {
        return this.id
    }

    async lookup(name: string): Promise<LookupResult> {
        const effectiveName = this.effectiveName(name)
        const map = await this.ensureMap()
        const result = map.get(effectiveName)
        if (result) return { ...result, authoritative: true }
        invalid(`Unknown name ${effectiveName}`, 404)
    }

    async register(name: string, address: string, ttl?: number): Promise<void> {
        const effectiveName = await this.effectiveName(name)
        const map = await this.ensureMap()
        if (map.has(effectiveName)) {
            invalid('Name already registered', 400)
        }
        const record: NameRecord = { name: effectiveName, address, ttl: ttl ?? THIRTY_MINUTES  }
        if (ttl !== undefined) {
            record.ttl = ttl
        }
        map.set(effectiveName, record)
        this.requestSave()
    }

    async update(name: string, previous: string, address: string, ttl?: number): Promise<boolean> {
        const effectiveName = this.effectiveName(name)
        const map = await this.ensureMap()
        const previousRecord = map.get(effectiveName)
        if (!previousRecord) {
            invalid(`Unknown name ${effectiveName}`, 404)
        }
        const normalPrevious = normalizeCode(previous)
        if (!normalPrevious) {
            invalid('Invalid previous address', 400)
        }
        if (normalPrevious != previousRecord.address) {
            return false
        }
        const normalAddress = normalizeCode(address)
        if (!normalAddress) {
            invalid('Invalid address', 400)
        }
        const record: NameRecord = { name: effectiveName, address: normalAddress, ttl: ttl ?? THIRTY_MINUTES }
        map.set(effectiveName, record)
        this.requestSave()
        return true
    }

    async forceSave(): Promise<void> {
        if (!this.saved && !this.saving) {
            await this.requestSave()
        }
        await this.savePromise
    }

    private async ensureMap(): Promise<Map<string, NameRecord>> {
        return this.map ?? await this.loadMap()
    }

    private effectiveName(name: string): string {
        return name.indexOf('.') >= 0 ? name : `${name}.local`
    }

    private saving = false
    private saved = false
    private savePromise = Promise.resolve()

    private async requestSave() {
        const doSave = async () => {
            if (this.saving) return
            this.saving = true
            try {
                await this.saveMap()
            } finally {
                this.saving = false
            }
            if (!this.saved) doSave()
        }

        this.saved = false
        if (!this.saving) this.savePromise = doSave()
    }

    private async loadMap(): Promise<Map<string, NameRecord>> {
        const fileName = this.dataFileName()
        const map = new Map<string, NameRecord>()
        this.map = map
        if (await fileExists(fileName)) {
            const dataText = await fs.readFile(fileName, 'utf-8')
            const data = JSON.parse(dataText) as NameRecord[]
            for (const entry of data) {
                map.set(entry.name, entry)
            }
        }
        this.saved = true
        return map
    }

    private async saveMap(): Promise<void> {
        const fileName = this.dataFileName()
        let data: NameRecord[] = []
        const map = this.map
        if (map) {
            data = [...map.values()]
        }
        this.saved = true
        const stateText = JSON.stringify(data)
        await this.ensureDir()
        await fs.writeFile(fileName, stateText, 'utf-8')
    }

    private async ensureDir() {
        const dir = this.dataPath()
        await fs.mkdir(dir, { recursive: true })
    }

    private dataFileName(): string {
        return path.join(this.dataPath(), 'names.json')
    }

    private dataPath(): string {
        const id = this.id
        return path.join(this.directory, id.slice(0, 2), id.slice(2, 4), id.slice(4))
    }
}

const THIRTY_MINUTES = 30 * 60 * 60 * 1000