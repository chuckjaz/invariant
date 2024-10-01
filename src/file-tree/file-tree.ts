import { BrokerClient } from "../broker/client"
import { dataToString, safeParseJson } from "../common/parseJson"
import { FindClient } from "../find/client"
import { Data, StorageClient } from "../storage/client"
import * as path from 'node:path/posix'

export enum EntryKind {
    File = "File",
    Directory = "Directory",
}

export interface BaseEntry {
    kind: EntryKind
    name: string
    createTime: number
    modifyTime: number
}

export interface FileEntry extends BaseEntry {
    kind: EntryKind.File
    content: ContentLink
    size: number
    type?: string
}

export interface DirectoryEntry extends BaseEntry {
    kind: EntryKind.Directory
    content: ContentLink
}

export type Entry = FileEntry | DirectoryEntry

export interface ContentLink {
    address: string
    slot?: boolean
    key?: string
    hash?: string
    algorithm?: string
    salt?: string
    blockTree?: boolean
}

export interface Block {
    content: ContentLink
    size: number
}

export type BlockTree = Block[]

export class FileTree {
    broker: BrokerClient
    find: FindClient
    rootContent: ContentLink
    storage?: StorageClient
    private rootDirectory: FileTreeDirectory | undefined = undefined

    constructor(broker: BrokerClient, find: FindClient, root: ContentLink, storage?: StorageClient) {
        this.broker = broker
        this.find = find
        this.rootContent = root
        this.storage = storage
    }

    async directory(dirPath: string): Promise<FileTreeDirectory | false> {
        return (await this.ensureRootDirectory())?.directory(dirPath) ?? false
    }

    async file(dirPath: string): Promise<Data | false> {
        return (await this.ensureRootDirectory())?.file(dirPath) ?? false
    }

    async readFile(content: ContentLink): Promise<Data | false> {
        if (content.blockTree) {
            const block = await this.readBlocks(content.address)
            if (block) {
                const text = await dataToString(block)
                const blocks = safeParseJson(text) as BlockTree
                if (blocks) {
                    return this.flatten(blocks)
                }
            }
        } else {
            return this.readBlocks(content.address)
        }
        return false
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

    private async ensureRootDirectory(): Promise<FileTreeDirectory | undefined> {
        const dir = this.rootDirectory
        if (!dir) {
            const newDir = await this.readDirectory(this.rootContent)
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
        const pending: FindClient[] = [this.find]
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
    private fileTree: FileTree
    private _entries: Map<string, Entry>

    constructor(fileTree: FileTree, entries: Entry[]) {
        this.fileTree = fileTree
        this._entries = new Map(entries.map(entry => [entry.name, entry]))
    }

    async file(dirPath: string): Promise<Data | false> {
        const content = await this.contentAt(dirPath)
        if (!content) return false
        return this.fileTree.readFile(content)
    }

    async directory(dirPath: string): Promise<FileTreeDirectory | false> {
        if (dirPath === '/') return this
        const content = await this.contentAt(dirPath)
        if (!content) return false
        return this.fileTree.readDirectory(content)
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
