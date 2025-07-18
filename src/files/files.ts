import { BrokerClient } from "../broker/broker_client";
import { BlockOverride, brotliDecompressData, dataFromBuffers, decipherData, hashTransform, inflateData, jsonFromData, limitData, measureTransform, overrideData, readAllData, setDataSize, splitData, unzipData, validateData } from "../common/data";
import { error, invalid } from "../common/errors";
import { dataFromString } from "../common/parseJson";
import { ReadWriteLock } from "../common/read-write-lock";
import { blockTreeSchema, directorySchema, entryKindSchema } from "../common/schema";
import { Block, BlockTree, ContentLink, ContentTransform, DirectoryEntry, Entry, EntryKind, etagOf, FileEntry } from "../common/types";
import { SlotsClient } from "../slots/slot_client";
import { Data, StorageClient } from "../storage/storage_client";
import { createHash } from 'node:crypto'
import { ContentInformation, ContentKind, ContentReader, EntryAttributes, FileDirectoryEntry, FilesClient, Node } from "./files_client";
import { stringCompare } from "../common/compares";
import { delay } from "../common/delay";

export class Files implements FilesClient, ContentReader {
    private id: string
    private broker: BrokerClient
    private storage: StorageClient
    private slots: SlotsClient
    private syncFrequency: number
    private mounts = new Set<Node>()
    private contentMap = new Map<Node, ContentLink>()
    private directories = new Map<Node, Map<string, Node>>()
    private parents = new Map<Node, Node>()
    private infos = new Map<Node, ContentInformation>()
    private overrides = new Map<Node, BlockOverride[]>()
    private transforms =  new Map<Node, (data: Data) => Data>()
    private invalidDirectories = new Set<Node>()
    private slotMounts = new Map<Node, string>()
    private locks = new Map<Node, ReadWriteLock>()
    private nextNode = 1

    constructor(id: string, storage: StorageClient, slots: SlotsClient, broker: BrokerClient, syncFrequency?: number) {
        this.id = id
        this.storage = storage
        this.slots = slots
        this.broker = broker
        this.syncFrequency = syncFrequency ?? 5000
    }

    async ping(): Promise<string> {
        return this.id
    }

    async mount(content: ContentLink, executable?: boolean, writable?: boolean): Promise<Node> {
        const node = this.newNode()
        if (content.slot !== undefined) {
            const slotId = content.address
            this.slotMounts.set(node, slotId)
            const current = await this.slots.get(slotId)
            if (current == undefined) invalid(`Could not find slot ${slotId}`);
            if (writable == undefined) {
                writable = true
            }
            content = {...content, address: current.address }
            delete content.slot
            this.scheduleSlotReads()
        }
        this.contentMap.set(node, content)

        const now = Date.now()
        const info: ContentInformation = {
            node,
            kind: ContentKind.Directory,
            modifyTime: now,
            createTime: now,
            executable: executable ?? false,
            writable: writable ?? content.slot === true,
            etag: etagOf(content)
        }
        this.infos.set(node, info)
        this.mounts.add(node)
        await this.ensureDirectory(node)
        return node
    }

    async unmount(node: Node): Promise<ContentLink> {
        if (!this.mounts.has(node)) invalid("Node is not a mount");
        this.mounts.delete(node)
        const content = nRequired(this.contentMap.get(node))
        this.forget(node)
        return content
    }

    async lookup(parent: Node, name: string): Promise<Node | undefined> {
        const directory = await this.ensureDirectory(parent)
        return directory.get(name)
    }

    async info(node: Node): Promise<ContentInformation | undefined> {
        return this.infos.get(node)
    }

    async content(node: Node): Promise<ContentLink> {
        return nRequired(this.contentMap.get(node))
    }

    async *readFile(node: Node, offset?: number, length?: number): Data {
        this.assertKind(node, ContentKind.File)
        const lock = nRequired(this.locks.get(node))
        await lock.readLock()
        try {
            const data = this.readFileDataLocked(node)
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
        } finally {
            lock.readUnlock()
        }
    }

    async writeFile(node: Node, data: Data, offset?: number, length?: number): Promise<number> {
        this.assertWritable(node, ContentKind.File)
        const lock = nRequired(this.locks.get(node))
        await lock.writeLock()
        try {
            const buffer = await readAllData(limitData(data, length))
            const effectiveOffset = offset ?? 0
            this.addOverride(node, { offset: effectiveOffset, buffer })
            const info = nRequired(this.infos.get(node))
            info.modifyTime = Date.now()
            const effectiveSize = info.size ?? 0
            const maxWritten = effectiveOffset + buffer.length
            if (maxWritten > effectiveSize) info.size = maxWritten
            const parent = nRequired(this.parents.get(node))
            this.invalidDirectories.add(parent)
            return buffer.length
        } finally {
            lock.writeUnlock()
        }
    }

    async setSize(node: Node, size: number): Promise<void> {
        this.assertWritable(node, ContentKind.File)
        const lock = nRequired(this.locks.get(node))
        await lock.writeLock()
        try {
            this.addTransform(node, data => setDataSize(size, data))
        } finally {
            lock.writeUnlock()
        }
    }

    async *readDirectory(node: Node, offset: number = 0, length: number = Number.MAX_SAFE_INTEGER): AsyncIterable<FileDirectoryEntry> {
        this.assertKind(node, ContentKind.Directory)
        const lock = nRequired(this.locks.get(node))
        await lock.readLock()
        try {
            const entries = await this.ensureDirectory(node)
            let current = 0
            for (const [name, node] of entries) {
                if (current < offset) continue
                if (current - offset > length) break
                current++
                const info = nRequired(this.infos.get(node))
                yield { name, kind: info.kind, node }
            }
        } finally {
            lock.readUnlock()
        }
    }

    async createNode(
        parent: Node,
        name: string,
        kind: ContentKind,
        content?: ContentLink,
    ): Promise<number> {
        this.assertWritable(parent, ContentKind.Directory)
        const lock = nRequired(this.locks.get(parent))
        await lock.writeLock()
        try {
            const entries = await this.ensureDirectory(parent)
            const info = nRequired(this.infos.get(parent))
            const now = Date.now()
            info.modifyTime = now
            this.invalidDirectories.add(parent)
            const node = this.newNode()
            const newInfo: ContentInformation = {
                node,
                kind,
                modifyTime: now,
                createTime: now,
                writable: true,
                executable: false,
                etag: "",
                size: 0
            }
            this.infos.set(node, newInfo)
            entries.set(name, node)
            this.parents.set(node, parent)
            this.invalidDirectories.add(parent)
            if (content) {
                this.contentMap.set(node, content)
            } else {
                if (kind == ContentKind.Directory) {
                    this.directories.set(node, new Map())
                    this.invalidDirectories.add(node)
                } else {
                    this.transforms.set(node, () => dataFromString(""))
                }
            }
            this.scheduleSync()
            return node
        } finally {
            lock.writeUnlock()
        }
    }

    async removeNode(parent: Node, name: string): Promise<boolean> {
        this.assertWritable(parent, ContentKind.Directory)
        const lock = nRequired(this.locks.get(parent))
        await lock.writeLock()
        try {
            const entries = nRequired(this.directories.get(parent))
            const node = entries.get(name)
            if (node !== undefined) {
                entries.delete(name)
                this.forget(node)
                this.invalidDirectories.add(parent)
                this.scheduleSync()
                return true
            }
            return false
        } finally {
            lock.writeUnlock()
        }
    }

    async setAttributes(node: Node, attributes: EntryAttributes): Promise<void> {
        const parent = nRequired(this.parents.get(node))
        const lock = nRequired(this.locks.get(parent))
        await lock.writeLock()
        try {
            const info = nRequired(this.infos.get(node))
            if (attributes.createTime !== undefined) {
                info.createTime = attributes.createTime
            }
            if (attributes.modifyTime !== undefined) {
                info.modifyTime = attributes.modifyTime
            }
            if (attributes.executable !== undefined) {
                info.executable = attributes.executable
            }
            if (attributes.writable !== undefined) {
                info.writable = attributes.writable
            }
            if (attributes.type !== undefined) {
                if (attributes.type == null) {
                    delete attributes.type
                } else {
                    info.type = attributes.type
                }
            }
            this.invalidDirectories.add(parent)
            this.scheduleSync()
        } finally {
            lock.writeUnlock()
        }
    }

    async rename(parent: Node, name: string, newParent: Node, newName: string): Promise<boolean> {
        const lock = nRequired(this.locks.get(parent))
        await lock.writeLock()
        try {
            const entries = nRequired(this.directories.get(parent))
            const newEntries = nRequired(this.directories.get(newParent))
            const node = entries.get(name)
            if (node === undefined) return false
            entries.delete(name)
            newEntries.set(newName, node)
            this.invalidDirectories.add(parent)

            this.invalidDirectories.add(newParent)
            this.scheduleSync()
            return true
        } finally {
            lock.writeUnlock()
        }
    }

    async link(parent: Node, node: Node, name: string): Promise<boolean> {
        const lock = nRequired(this.locks.get(parent))
        await lock.writeLock()
        try {
            const entries = nRequired(this.directories.get(parent))
            const found = entries.get(name)
            if (found !== undefined) return false
            entries.set(name, node)
            this.invalidDirectories.add(parent)
            this.scheduleSync()
            return true
        } finally {
            lock.writeUnlock()
        }
    }

    sync(): Promise<void> {
        if (this.syncTimeout) {
            clearTimeout(this.syncTimeout)
            this.syncTimeout = undefined
            this.scheduleSync(0)
        }
        return this.previousSync
    }

    stop() {
        if (this.syncTimeout) {
            clearTimeout(this.syncTimeout)
            this.syncTimeout = undefined
        }
        if (this.slotReadsTimeout) {
            clearInterval(this.slotReadsTimeout)
            this.slotReadsTimeout = undefined
        }
    }

    private addTransform(node: Node, tx: (data: Data) => Data) {
        const previous = this.transforms.get(node)
        if (previous !== undefined) {
            this.transforms.set(node, data => tx(previous(data)))
            this.overrides.delete(node)
        } else {
            this.transforms.set(node, tx)
        }
    }

    private forget(node: Node) {
        const remove = [node]
        while (remove.length > 0) {
            const node = remove.pop()
            if (!node) break
            const entries = this.directories.get(node)
            if (entries) remove.push(...entries.values());
            this.directories.delete(node)
            this.contentMap.delete(node)
            this.overrides.delete(node)
            this.parents.delete(node)
            this.infos.delete(node)
            this.transforms.delete(node)
            this.invalidDirectories.delete(node)
            this.slotMounts.delete(node)
            this.locks.delete(node)
        }
    }

    private async *readFileDataLocked(node: Node): Data {
        const content = this.contentMap.get(node)
        let data = content ? this.readContentLink(content) : dataFromBuffers([])
        const transforms = this.transforms.get(node)
        if (transforms) {
            data = transforms(data)
        }
        yield *data
    }

    private addOverride(node: Node, override: BlockOverride) {
        let overrides = this.overrides.get(node)
        if (overrides === undefined) {
            const newOverrides = [override]
            this.overrides.set(node, newOverrides)
            const previous = this.transforms.get(node)
            if (previous === undefined) {
                this.transforms.set(node, data => overrideData(newOverrides, data))
            } else {
                this.transforms.set(node, data => overrideData(newOverrides, previous(data)))
            }
        } else {
            overrides.push(override)
        }
        this.scheduleSync()
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
            let data = this.readContentLink(content);
            if (!content.slot) data = validateData(data, content.expected ?? content.address)
            const directory = await jsonFromData(directorySchema, data) as Entry[]
            if (!directory) invalid(`Could not read directory`);
            for (const entry of directory) {
                const entryNode = this.newNode()
                const content = entry.content
                let mode = entry.mode ?? entry.kind == EntryKind.File ? "" : "x";
                if (!directoryInfo.writable && mode.indexOf('r') < 0) mode += 'r'
                const info: ContentInformation = {
                    node: entryNode,
                    kind: entry.kind == EntryKind.Directory ? ContentKind.Directory : ContentKind.File,
                    modifyTime: entry.modifyTime ?? Date.now(),
                    createTime: entry.createTime ?? Date.now(),
                    executable: mode.indexOf("x") >= 0,
                    writable: mode.indexOf("r") < 0,
                    etag: etagOf(content),
                }
                if (entry.kind == EntryKind.File) {
                    if (entry.type) info.type = entry.type;
                    if (entry.size !== undefined) info.size = entry.size
                }
                this.infos.set(entryNode, info)
                this.contentMap.set(entryNode, entry.content)
                entries.set(entry.name, entryNode)
                this.parents.set(entryNode, node)
            }
            this.directories.set(node, entries)
        }
        return entries
    }

    async *readContentLink(content: ContentLink): Data {
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

    async writeContentLink(data: Data): Promise<ContentLink> {
        const block = await this.writeData(data)
        if (!block) error("Could not write data");
        return block.content
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
        if (tree as any === undefined) invalid(`Invalid block tree JSON in ${address}`);
        const blockTree: BlockTree = tree as BlockTree
        for (const block of blockTree) {
            yield *this.readContentLink(block.content)
        }
    }

    private assertKind(node: Node, kind: ContentKind) {
        const info = nRequired(this.infos.get(node))
        if (info.kind != kind) {
            invalid(kind == ContentKind.Directory ? "Node is not a directory" : "Node is not a file")
        }
    }

    private assertWritable(node: Node, kind: ContentKind) {
        let info = nRequired(this.infos.get(node))
        if (info.kind != kind) {
            this.assertKind(node, kind)
        }
        while (true) {
            if (!info.writable) invalid(kind == ContentKind.Directory ? "Directory is not writable" : "File is not writable");
            const parent = this.parents.get(node)
            if (parent === undefined) break
            node = parent
        }
    }

    private previousSync = Promise.resolve()
    private syncTimeout?: NodeJS.Timeout

    private scheduleSync(timeout: number = this.syncFrequency) {
        if (this.syncTimeout) {
            return
        }
        this.syncTimeout = setTimeout(this.sinkTimeoutFunc.bind(this), timeout)
    }

    private sinkTimeoutFunc() {
        this.syncTimeout = undefined
        this.previousSync = this.doSync(this.previousSync)
    }

    private async doSync(previousSync: Promise<void>) {
        await previousSync
        const nodes = [...this.transforms.keys()]
        for (const node of nodes) {
            await this.syncFile(node)
        }
        const roots = new Set<Node>()
        const seen = new Set<Node>()
        for (const node of [...this.invalidDirectories]) {
            let current = node
            if (seen.has(current)) break
            while (true) {
                seen.add(current)
                this.invalidDirectories.add(current)
                const newCurrent = this.parents.get(current)
                if (newCurrent === undefined) break
                current = newCurrent
            }
            roots.add(current)
        }
        for (const node of roots) {
            await this.syncDirectory(node)
        }
    }

    private async syncDirectory(node: Node) {
        // Prevent a sync from dominating the scheduling
        await delay(0)
        const lock = nRequired(this.locks.get(node))
        await lock.writeLock()
        try {
            const entries = this.directories.get(node)
            if (!entries) {
                return
            }
            for (const entryNode of entries.values()) {
                if (this.invalidDirectories.has(entryNode)) {
                    await this.syncDirectory(entryNode)
                }
            }
            const directoryEntries: Entry[] = []
            for (const [name, entryNode] of entries) {
                const info = this.infos.get(entryNode)
                if (!info) error(`Could not find info for ${name} in directory node ${node}, file node: ${entryNode}`);
                const content = this.contentMap.get(entryNode)
                if (!content) {
                    // This entry was create during the sync. Ignore the entry for now as another sync
                    // is coming that will give this entry content
                    continue
                }
                if (info.kind == ContentKind.Directory) {
                    const directoryEntry: DirectoryEntry = {
                        kind: EntryKind.Directory,
                        name,
                        content,
                        createTime: info.createTime,
                        modifyTime: info.modifyTime
                    }
                    directoryEntries.push(directoryEntry)
                } else {
                    const fileEntry: FileEntry = {
                        kind: EntryKind.File,
                        name,
                        content,
                        createTime: info.createTime,
                        modifyTime: info.modifyTime,
                        size: info.size,
                        type: info.type
                    }
                    directoryEntries.push(fileEntry)
                }
            }
            directoryEntries.sort((a, b) => stringCompare(a.name, b.name))
            const etag = directoryEtag(directoryEntries)
            const directoryEntriesText = JSON.stringify(directoryEntries)

            const directoryBlock = await this.writeData(dataFromString(directoryEntriesText), node, etag)
            if (!directoryBlock) return
            const previous = this.contentMap.get(node)
            this.contentMap.set(node, directoryBlock.content)
            this.invalidDirectories.delete(node)
            const info = this.infos.get(node)
            if (info) info.etag = etag
            if (previous) {
                const slot = this.slotMounts.get(node)
                if (slot) {
                    const result = await this.slots.put(slot, {
                        previous: previous.address,
                        address: directoryBlock.content.address
                    })
                    if (!result) {
                        console.error(`Update of slot ${slot} failed`)
                    }
                }
            }
        } finally {
            lock.writeUnlock()
        }
    }

    private async syncFile(node: Node) {
        const lock = nRequired(this.locks.get(node))
        await lock.writeLock()
        try {
            const data = this.readFileDataLocked(node)
            const dataBlock = await this.writeData(data, node)
            if (!dataBlock) return
            const info = nRequired(this.infos.get(node))
            info.etag = etagOf(dataBlock.content)
            info.size = dataBlock.size
            this.contentMap.set(node, dataBlock.content)
            this.overrides.delete(node)
            this.transforms.delete(node)
            const parent = this.parents.get(node)
            if (parent !== undefined) {
                this.invalidDirectories.add(parent)
            }
        } finally {
            lock.writeUnlock()
        }
    }

    private async writeData(data: Data, node?: Node, etag?: string): Promise<Block | undefined> {
        const pieceLimit = 1024 * 1024
        const hash = createHash('sha256')
        data = hashTransform(data, hash)
        const sizeBox = { size: 0 }
        data = measureTransform(data, sizeBox)
        data = splitData(data, index => (index + 1) * pieceLimit)
        const blocks: Block[] = []
        const buffers: Buffer[] = []
        let current = 0
        const that = this

        async function writeBuffers(): Promise<boolean> {
            if (buffers.length == 0) return true
            const address = await that.storage.post(dataFromBuffers(buffers))
            buffers.length = 0
            if (!address) {
                console.error(`Could not save file${ node ? `, writes to ${node} were lost` : ''}`)
                return false
            }
            const content: ContentLink = { address }
            blocks.push({ content, size: current })
            current = 0
            return true
        }

        for await (const buffer of data) {
            buffers.push(buffer)
            current += buffer.length
            if (current >= pieceLimit) {
                if (!await writeBuffers()) return undefined
            }
        }

        if (!await writeBuffers()) return undefined

        if (blocks.length == 1) {
            const block = blocks[0]
            if (etag) {
                block.content.etag = etag
            }
            return block
        }
        const blocksText = JSON.stringify(blocks)
        const blocksData = dataFromString(blocksText)
        const blocksBlock = await this.writeData(blocksData, node)
        if (blocksBlock === undefined) return
        const expected = hash.digest().toString('hex')
        const transforms: ContentTransform[] = [{ kind: "Blocks" }]
        const content: ContentLink = { ...blocksBlock.content,  expected, transforms }
        if (etag) content.etag = etag
        return { content, size: sizeBox.size }
    }

    private slotReadsTimeout?: NodeJS.Timeout
    private previousSlotReads = Promise.resolve()

    private scheduleSlotReads() {
        if (this.slotReadsTimeout) return
        this.slotReadsTimeout = setInterval(this.slotReadsInterval.bind(this), this.syncFrequency)
    }

    private slotReadsInterval() {
        this.previousSlotReads = this.doSlotReads(this.previousSlotReads)
    }

    private async doSlotReads(previousSlotReads: Promise<void>) {
        await previousSlotReads
        if (this.slotMounts.size == 0) {
            clearInterval(this.slotReadsTimeout)
            this.slotReadsTimeout = undefined
            return
        }
        for (const [node, slot] of this.slotMounts) {
            if (this.invalidDirectories.has(node)) continue
            const slotResult = await this.slots.get(slot)
            if (!slotResult) continue
            const address = slotResult.address
            const content = this.contentMap.get(node)
            if (!content) continue
            if (content.address == address) continue
            this.directories.delete(node)
            content.address = address
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
        const node = this.nextNode++
        this.locks.set(node, new ReadWriteLock())
        return node
    }
}

function nRequired<T>(value: T | undefined): T {
    if (value) return value
    invalid("Unrecognized node")
}

function hashText(text: string): string {
    const hash = createHash('sha256')
    const buffer = new TextEncoder().encode(text)
    hash.update(buffer)
    const digest = hash.digest()
    return digest.toString('hex')
}

export function directoryEtag(entries: Entry[]): string {
    const etagData = entries.map(e => ({ name: e.name, etag: etagOf(e.content) }))
    const etagText = JSON.stringify(etagData)
    const hash = hashText(etagText)
    return hash
}