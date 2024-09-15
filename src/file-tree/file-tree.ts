import { BrokerClient } from "../broker/client"
import { safeParseJson } from "../common/parseJson"
import { FindClient } from "../find/client"
import { StorageClient } from "../storage/client"
import { Blob } from 'node:buffer'
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
    size: number
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

    async directory(dirPath: string): Promise<FileTreeDirectory | undefined> {
        return (await this.ensureRootDirectory())?.directory(dirPath)
    }

    async file(dirPath: string): Promise<Blob | undefined> {
        return (await this.ensureRootDirectory())?.file(dirPath)
    }

    async readFile(content: ContentLink): Promise<Blob | undefined> {
        if (content.blockTree) {
            const block = await this.readBlock(content.address)
            if (block) {
                const text = await block.text()
                const blocks = safeParseJson(text) as BlockTree
                if (blocks) {
                    const blobs = await Promise.all(blocks.map(block => this.readFile(block.content)))
                    if (blobs.every(i => i)) {
                        return new Blob(blobs as Blob[])
                    }
                }
            }
        } else {
            return this.readBlock(content.address)
        }
    }

    async readDirectory(content: ContentLink): Promise<FileTreeDirectory | undefined> {
        const contentBlob = await this.readFile(content)
        if (!contentBlob) return
        const contentText = await contentBlob.text()
        const entries = safeParseJson(contentText) as (Entry[] | undefined)
        if (!entries) return
        return new FileTreeDirectory(this, entries)
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

    private async readBlock(address: string): Promise<Blob | undefined> {
        const storage = await this.findStorage(address)
        if (storage) {
            return storage.get(address)
        }
    }

    private async findStorage(address: string): Promise<StorageClient | undefined> {
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
    }
}

export class FileTreeDirectory {
    private fileTree: FileTree
    private entries: Map<string, Entry>

    constructor(fileTree: FileTree, entries: Entry[]) {
        this.fileTree = fileTree
        this.entries = new Map(entries.map(entry => [entry.name, entry]))
    }

    async file(dirPath: string): Promise<Blob | undefined> {
        const content = await this.contentAt(dirPath)
        if (!content) return
        return this.fileTree.readFile(content)
    }

    async directory(dirPath: string): Promise<FileTreeDirectory | undefined> {
        const content = await this.contentAt(dirPath)
        if (!content) return
        return this.fileTree.readDirectory(content)
    }

    find(regex: RegExp): string[] {
        const result: string[] = []
        for (const [name, _] of this.entries) {
            if (name.match(regex)) {
                result.push(name)
            }
        }
        return result
    }

    entry(name: string): Entry | undefined {
        return this.entries.get(name)
    }

    private async contentAt(contentPath: string): Promise<ContentLink | undefined> {
        const normalPath = path.normalize(contentPath)
        const parsedPath = path.parse(normalPath)
        let dir: FileTreeDirectory | undefined = this
        for (const name of parsedPath.dir.split(path.delimiter)) {
            if (!name) return
            dir = await dir.directory(name)
            if (!dir) return
        }
        const entry = dir.entry(parsedPath.base)
        if (!entry) return
        if (entry.kind == EntryKind.Directory || entry.kind == EntryKind.File) {
            return entry.content
        }
    }
}
