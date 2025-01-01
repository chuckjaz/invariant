import { BrokerClient } from "../broker/broker_client"
import { dataToString, safeParseJson } from "../common/parseJson"
import { BlockTree, ContentLink, Entry, EntryKind } from "../common/types"
import { FindClient } from "../find/client"
import { Data, StorageClient } from "../storage/storage_client"
import * as path from 'node:path/posix'

export class FileTree {
    broker: BrokerClient
    finder: FindClient
    rootContent: ContentLink
    storage?: StorageClient
    private rootDirectory: FileTreeDirectory | undefined = undefined
    private fileReader:  FileContentReader

    constructor(broker: BrokerClient, finder: FindClient, root: ContentLink, storage?: StorageClient) {
        this.broker = broker
        this.finder = finder
        this.rootContent = root
        this.storage = storage
        this.fileReader =  new FileContentReader(broker, finder, storage)
    }

    async directory(dirPath: string): Promise<FileTreeDirectory | false> {
        return (await this.ensureRootDirectory())?.directory(dirPath) ?? false
    }

    async file(dirPath: string): Promise<Data | false> {
        return (await this.ensureRootDirectory())?.file(dirPath) ?? false
    }

    async readFile(content: ContentLink): Promise<Data | false> {
        return this.readBlocks(content.address)
    }

    private async *flatten(blocks: BlockTree): Data {
        for (const block of blocks) {
            const part = await this.readFile(block.content)
            if (part) yield *part
            else throw new Error(`Missing file content link ${block.content.address}`)
        }
    }

    private async ensureRootDirectory(): Promise<FileTreeDirectory | undefined> {
        const dir = this.rootDirectory
        if (!dir) {
            const newDir = await this.fileReader.readDirectory(this.rootContent)
            if (!newDir) return
            this.rootDirectory = newDir
            return newDir
        }
        return dir
    }

    private async readBlocks(address: string): Promise<Data | false> {
        const storage = await this.findStorage(address)
        if (storage) {
            return storage.get(address)
        }
        return false
    }

    private async findStorage(address: string): Promise<StorageClient | false> {
        if (this.storage && await this.storage.has(address)) {
            return this.storage
        }
        return findStorage(address, this.finder, this.broker)
    }
}

export async function findStorage(address: string, finder: FindClient, broker: BrokerClient): Promise<StorageClient | false> {
    const pending: FindClient[] = [finder]
    while (pending.length) {
        const find = pending.shift()!!
        for await (const entry of await find.find(address)) {
            switch (entry.kind) {
                case "HAS": {
                    const storage = await broker.storage(entry.container)
                    if (storage && await storage.has(address))
                        return storage
                    break
                }
                case "CLOSER":
                    const newFindClient = await broker.find(entry.find)
                    if (newFindClient) pending.push(newFindClient)
                    break
            }
        }
    }
    return false
}

export class FileContentReader {
    broker: BrokerClient
    finder: FindClient
    storage?: StorageClient

    constructor (broker: BrokerClient, finder: FindClient, storage?: StorageClient) {
        this.broker = broker
        this.finder = finder
    }

    async readFile(content: ContentLink): Promise<Data | false> {
        return this.readBlocks(content.address)
    }

    async readDirectory(content: ContentLink): Promise<FileTreeDirectory | false> {
        const contentData = await this.readFile(content)
        if (!contentData) return false
        const contentText = await dataToString(contentData)
        const entries = safeParseJson(contentText) as (Entry[] | undefined)
        if (!entries) return false
        return new FileTreeDirectory(this, entries)
    }

    private async *flatten(blocks: BlockTree): Data {
        for (const block of blocks) {
            const part = await this.readFile(block.content)
            if (part) yield *part
            else throw new Error(`Missing file content link ${block.content.address}`)
        }
    }

    private async readBlocks(address: string): Promise<Data | false> {
        const storage = await this.findStorage(address)
        if (storage) {
            return storage.get(address)
        }
        return false
    }

    private async findStorage(address: string): Promise<StorageClient | false> {
        if (this.storage && await this.storage.has(address)) {
            return this.storage
        }
        const pending: FindClient[] = [this.finder]
        while (pending.length) {
            const find = pending.shift()!!
            for await (const entry of await find.find(address)) {
                switch (entry.kind) {
                    case "HAS": {
                        const storage = await this.broker.storage(entry.container)
                        if (storage && await storage.has(address))
                            return storage
                        break
                    }
                    case "CLOSER":
                        const newFindClient = await this.broker.find(entry.find)
                        if (newFindClient) pending.push(newFindClient)
                        break
                }
            }
        }
        return false
    }
}

export class FileTreeDirectory {
    private fileReader: FileContentReader
    private _entries: Map<string, Entry>

    constructor(fileReader: FileContentReader, entries: Entry[]) {
        this.fileReader = fileReader
        this._entries = new Map(entries.map(entry => [entry.name, entry]))
    }

    async file(dirPath: string): Promise<Data | false> {
        const content = await this.contentAt(dirPath)
        if (!content) return false
        return this.fileReader.readFile(content)
    }

    async directory(dirPath: string): Promise<FileTreeDirectory | false> {
        if (dirPath === '/') return this
        const content = await this.contentAt(dirPath)
        if (!content) return false
        return this.fileReader.readDirectory(content)
    }

    async *find(regex: RegExp): AsyncIterable<string> {
        for (const [name, _] of this._entries) {
            if (name.match(regex)) {
                yield name
            }
        }
    }

    async entry(name: string): Promise<Entry | false> {
        return this._entries.get(name) ?? false
    }

    async *entries(): AsyncIterable<Entry> {
        yield *this._entries.values()
    }

    private async contentAt(contentPath: string): Promise<ContentLink | false> {
        const normalPath = path.normalize(contentPath)
        const parsedPath = path.parse(normalPath)
        let dir: FileTreeDirectory | false = this
        for (const name of parsedPath.dir.split(path.sep)) {
            if (!name) return false
            dir = await dir.directory(name)
            if (!dir) return false
        }
        const entry = await dir.entry(parsedPath.base)
        if (!entry) return false
        if (entry.kind == EntryKind.Directory || entry.kind == EntryKind.File) {
            return entry.content
        }
        return false
    }
}
