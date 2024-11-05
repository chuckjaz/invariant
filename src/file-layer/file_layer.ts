import { BrokerClient } from "../broker/client";
import { brotliDecompressData, decipherData, hashTransform, inflateData, jsonFromData, splitData, unzipData, validateData } from "../common/data";
import { invalid } from "../common/errors";
import { blockTreeSchema, directorySchema } from "../common/schema";
import { BlockTree, ContentLink, ContentTransform, Entry, EntryKind } from "../common/types";
import { SlotsClient } from "../slots/slot_client";
import { Data, StorageClient } from "../storage/client";

export type Node = number

export enum ContentKind {
    File = "File",
    Directory = "Directory",
}

export interface ContentInformation {
    node: Node
    kind: ContentKind
    modifyTime: number
    createTime: number
    executable: boolean
    writable: boolean
    etag: string
    size?: number
    type?: string
}

export interface FileDirectoryEntry extends ContentInformation {
    name: string
}

export class FileLayer {
    private broker: BrokerClient
    private storage: StorageClient
    private slots: SlotsClient
    private syncFrequency: number
    private contentMap = new Map<Node, ContentLink>()
    private directories = new Map<Node, Map<string, Node>>()
    private parents = new Map<Node, Node>()
    private infos = new Map<Node, ContentInformation>()
    private nextNode = 0

    constructor(storage: StorageClient, slots: SlotsClient, broker: BrokerClient, syncFrequency: number) {
        this.storage = storage
        this.slots = slots
        this.broker = broker
        this.syncFrequency = syncFrequency
    }

    mount(content: ContentLink): Node {
        const node = this.newNode()
        this.contentMap.set(node, content)
        const now = Date.now()
        const info: ContentInformation = {
            node,
            kind: ContentKind.Directory,
            modifyTime: now,
            createTime: now,
            executable: false,
            writable: content.slot !== undefined,
            etag: content.expected ?? content.address
        }
        this.infos.set(node, info)
        return node
    }

    async lookup(parent: Node, name: string): Promise<Node | undefined> {
        const directory = await this.ensureDirectory(parent)
        return directory.get(name)
    }

    async info(node: Node): Promise<ContentInformation | undefined> {
        return this.infos.get(node)
    }

    async *readFile(node: Node, offset?: number, length?: number): Data {
        const info = nRequired(this.infos.get(node))
        if (info.kind != ContentKind.File) invalid(`Node is not a file`)
        const content = nRequired(this.contentMap.get(node))
        const data = this.readContentLink(content)
        if (offset !== undefined) {
            const l = length ?? Number.MAX_VALUE
            let current = 0
            let end = offset + l
            for await (const buffer of splitData(data, [offset, end])) {
                if (current >= offset) {
                    yield buffer
                }
                current += buffer.length
                if (current >= end) break
            }
        } else {
            yield *data
        }
    }

    async *readDirectory(node: Node): AsyncIterable<FileDirectoryEntry> {
        const entries = await this.ensureDirectory(node)
        for (const [name, node] of entries) {
            const info = nRequired(this.infos.get(node))
            yield { name, ...info }
        }
    }

    private async ensureDirectory(node: Node): Promise<Map<string, Node>> {
        const directoryInfo = nRequired(this.infos.get(node))
        if (directoryInfo.kind != ContentKind.Directory) invalid(`Node is not a directory`);
        let entries = this.directories.get(node)
        if (!entries) {
            entries = new Map()
            const info = nRequired(this.infos.get(node))
            if (info.kind != ContentKind.Directory) invalid("Node is not a directory");
            const content = nRequired(this.contentMap.get(node))
            let data = validateData(this.readContentLink(content), content.expected ?? content.address)
            const directory = await jsonFromData(directorySchema, data) as Entry[]
            if (!directory) invalid(`Could not read directory`);
            for (const entry of directory) {
                const entryNode = this.newNode()
                const content = entry.content
                const info: ContentInformation = {
                    node: entryNode,
                    kind: entry.kind == EntryKind.Directory ? ContentKind.Directory : ContentKind.File,
                    modifyTime: entry.modifyTime ?? Date.now(),
                    createTime: entry.createTime ?? Date.now(),
                    executable: (entry.mode?.indexOf("x") ?? -1) >= 0,
                    writable: ((entry.mode?.indexOf("r") ?? -1) >= 0),
                    etag: content.expected ?? content.address,
                }
                if (entry.kind == EntryKind.File) {
                    if (entry.type) info.type = entry.type;
                    if (entry.size !== undefined) info.size = entry.size
                }
                this.infos.set(entryNode, info)
                this.contentMap.set(entryNode, entry.content as any as ContentLink)
                entries.set(entry.name, entryNode)
                this.parents.set(entryNode, node)
            }
            this.directories.set(node, entries)
        }
        return entries
    }

    private async *readContentLink(content: ContentLink): Data {
        let address: string
        if (content.slot) {
            const current = await this.slots.get(content.address)
            if (!current) invalid(`Could not find slot ${content.slot}`);
            address = current.address
        } else {
            address = content.address
        }
        let data = await this.storage.get(address)
        if (!data && content.primary) {
            const primaryStorage = await this.findStorage(content.primary)
            if (primaryStorage) {
                data = await primaryStorage.get(address)
            }
        }

        if (!data) invalid(`Could not find ${address}`);

        if (content.transforms) {
            data = this.transformReadData(address, data, content.transforms)
        }

        yield *data
    }

    private transformReadData(address: string, data: Data, transforms: ContentTransform[]): Data {
        for (const transform of transforms) {
            switch (transform.kind) {
                case "Blocks":
                    data = this.expandBlocks(address, data)
                    break
                case "Decipher":
                    switch (transform.algorithm) {
                        case "aes-256-cbc":
                            data = decipherData(transform.algorithm, transform.key, transform.iv, data)
                            break
                        default:
                            invalid(`Unsupported algorithm ${(transform as any).algorithm}`)
                    }
                    break
                case "Decompress":
                    switch (transform.algorithm) {
                        case "brotli":
                            data = brotliDecompressData(data)
                            break
                        case "inflate":
                            data = inflateData(data)
                            break
                        case "unzip":
                            data = unzipData(data)
                            break
                    }
                    break
                default:
                    invalid("Unexpected transform")
            }
        }
        return data
    }

    private async *expandBlocks(address: string, data: Data): Data {
        const tree = await jsonFromData(blockTreeSchema, data)
        if (tree === undefined) invalid(`Invalid block tree JSON in ${address}`);
        const blockTree: BlockTree = tree as BlockTree
        for (const block of blockTree) {
            yield *this.readContentLink(block.content)
        }
    }

    private storageCache = new Map<string, StorageClient>()
    private async findStorage(storage: string): Promise<StorageClient | undefined> {
        let storageClient = this.storageCache.get(storage)
        if (storageClient) {
            if (await storageClient.ping()) {
                return storageClient
            } else {
                this.storageCache.delete(storage)

            }
        }
        storageClient = await this.broker.storage(storage)
        if (storageClient) {
            this.storageCache.set(storage, storageClient)
            return storageClient
        }
        return undefined
    }

    private newNode(): number {
        return this.nextNode++
    }
}

 function nRequired<T>(value: T | undefined): T {
    if (value) return value
    invalid("Unrecognized node")
}


function sorted<T>(arr: T[]): boolean {
    for (let i = 0, limit = arr.length - 2; i < limit; i++) {
        if (arr[i] > arr[i + 1]) return false
    }
    return true
}

