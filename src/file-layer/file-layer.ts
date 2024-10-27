import { BrokerClient } from "../broker/client";
import { CronTab } from "../common/cron_tab";
import { hashTransform } from "../common/data";
import { ParallelContext } from "../common/parallel_context";
import { ReadWriteLock } from "../common/read-write-lock";
import { ContentLink } from "../common/types";
import { findContainer } from "../file-tree/file-tree";
import { FindClient } from "../find/client";
import { SlotsClient } from "../slots/slot_client";
import { Data, StorageClient } from "../storage/client";
import { ContentInformation, ContentKind, DirectoryEntry, FileLayerClient, Node } from "./file-layer-client";
import { createHash } from 'node:crypto'

export class FileLayer implements FileLayerClient {
    private context = new ParallelContext()
    private broker: BrokerClient
    private finder: FindClient
    private infos = new Map<Node, ContentInformation>()
    private nodeToParent = new Map<Node, Node>()
    private entires = new Map<Node, Map<string, DirectoryEntry>>()
    private mountPoints = new Map<Node, MountPointInfo>()
    private addressMap = new Map<Node, string>()
    private contentMap = new Map<string, Content>()
    private next = 1
    private cronTab = new CronTab()
    private slotReads = new Map<Node, () => Promise<void>>()
    private invalidations = new Map<Node, () => Promise<void>>()
    private slotPingFrequency: number
    private slotWriteDelay: number
    private contentWriteDelay: number
    private cacheSize: number = 0
    private cachedSize: number = 0

    constructor(
        broker: BrokerClient,
        finder: FindClient,
        cacheSize: number = 10 * 1024 * 1024,
        slotPingFrequency: number = 500,
        slotWriteDelay: number = 100,
        contentWriteDelay: number = 100,
    ) {
        this.broker = broker
        this.finder = finder
        this.cacheSize = cacheSize
        this.slotPingFrequency = slotPingFrequency
        this.slotWriteDelay = slotWriteDelay
        this.contentWriteDelay = contentWriteDelay
    }

    async mountId(id: string): Promise<Node> {
        const node = this.nextNode()
        this.mountPoints.set(node, mountInfoOf(fixedMountPoint(id)))
        return node
    }

    async mountSlot(slot: string, readonly: boolean = false): Promise<Node> {
        const slotClient = await this.findSlotClient(slot)
        const mountPoint = readonly ? readonlySlotMountPoint(slot, slotClient) : updateableSlotMountPoint(slot, slotClient);
        const node = this.nextNode()
        this.mountPoints.set(node, mountInfoOf(mountPoint))
        this.scheduleSlotReads(node)
        return node
    }

    async unmount(node: Node): Promise<void> {
        await this.forget(node)
        this.cancelSlotReads(node)
    }

    async lookup(parent: Node, name: string): Promise<Node | undefined> {
        return required(this.entires.get(parent)).get(name)?.node
    }

    async info(node: Node): Promise<ContentInformation> {
        return required(this.infos.get(node))
    }

    async createFile(parent: Node, name: string): Promise<Node> {
        return this.createNode(parent, ContentKind.File, name)
    }

    async *readFile(node: Node, offset: number = 0, size: number = Number.MAX_SAFE_INTEGER): Data {
        await this.readLockNode(node)
        try {
            const info = required(this.infos.get(node))
            if (info.kind != ContentKind.File) invalid("Node is not a file")
            const address = required(this.addressMap.get(node))
            const content = required(this.contentMap.get(address))
            let current = 0
            const end = Math.min(offset + size, Number.MAX_SAFE_INTEGER)
            for await (let buffer of this.dataFromFlatContent(this.splitFlatContent(this.splitFlatContent(this.flattenContent(content), offset), end))) {
                if (current >= offset && current < end ) {
                    yield buffer
                    current += buffer.length
                }
                if (current >= end) break
            }
        } finally {
            this.readUnlockNode(node)
        }
    }

    async writeFile(node: Node, data: Data, offset: number = 0): Promise<number> {
        await this.writeLockNode(node)
        try {
            const info = required(this.infos.get(node))
            if (info.kind != ContentKind.File) invalid("Node is not a file");
            if (!info.writable) invalid("File is read-only")
            const address = required(this.addressMap.get(node))
            const content = required(this.contentMap.get(address))
            const newContent: Content = []
            let current = 0
            let currentContent = 0
            let written = 0

            for await (const piece of this.splitFlatContent(this.flattenContent(content), offset)) {
                if (current < offset) {
                    newContent.push(piece)
                    current += piece.size
                    currentContent += piece.size
                } else if (current == offset) {
                    for await (const buffer of data) {
                        written += buffer.length
                        current += buffer.length
                        currentContent += buffer.length
                        newContent.push(newBufferContent(buffer))
                    }
                } else if (current < currentContent) {
                    const next = current + piece.size
                    if (next < current) {
                        newContent.push(piece)
                        currentContent += piece.size
                    } else {
                        switch (piece.kind) {
                            case ContentPieceKind.Zero:
                                newContent.push(newZeroContent(currentContent - next))
                                current = currentContent
                                break
                            case ContentPieceKind.Buffer:
                                newContent.push(newBufferContent(piece.buffer.subarray(currentContent - next)))
                                current = currentContent
                                break
                        }
                    }
                } else {
                    content.push(piece)
                }
            }
            this.replaceNodeContentWriteLocked(node, address, newContent, info)
            return written
        } finally {
            this.writeUnlockNode(node)
        }
    }

    async setAttributes(node: Node, writable?: boolean, executable?: boolean): Promise<void> {
        await this.writeLockNode(node)
        try {
            const info = required(this.infos.get(node))
            if (writable !== undefined) info.writable = writable;
            if (executable !== undefined) info.executable = executable;
        } finally {
            this.writeUnlockNode(node)
        }
    }

    async setSize(node: Node, size: number): Promise<void> {
        await this.writeLockNode(node)
        try {
            let current = 0
            const address = required(this.addressMap.get(node))
            const content = required(this.contentMap.get(address))
            const newContent: Content = []
            for await (const piece of this.splitFlatContent(this.flattenContent(content), size)) {
                current += piece.size
                if (current < size) {
                    newContent.push(piece)
                } else break
            }
            if (current < size) {
                newContent.push(newZeroContent(size - current))
            }
            this.replaceNodeContentWriteLocked(node, address, content)
        } finally {
            this.writeUnlockNode(node)
        }
    }

    removeFile(parent: Node, name: string): Promise<void> {
        return this.removeNode(parent, ContentKind.File, name)
    }

    async allocateFileSpace(node: Node, offset: number, size: number): Promise<void> {
        await this.writeLockNode(node)
        try {
            const address = required(this.addressMap.get(node))
            const content = required(this.contentMap.get(address))
            const newContent = []
            let calculatedSize = 0
            for await (const piece of this.flattenContent(content)) {
                newContent.push(piece)
                calculatedSize += piece.size
            }
            if (calculatedSize < size) {
                newContent.push(newZeroContent(size - calculatedSize))
                this.replaceNodeContentWriteLocked(node, address, newContent)
            }
        } finally {
            this.writeUnlockNode(node)
        }
    }

    async createDirectory(parent: Node, name: string): Promise<Node> {
        return this.createNode(parent, ContentKind.Directory, name)
    }

    async *readDirectory(node: Node): AsyncIterable<DirectoryEntry> {
        await this.readLockNode(node)
        try {
            const entries = required(this.entires.get(node))
            yield *entries.values()
        } finally {
            this.readUnlockNode(node)
        }
    }

    removeDiretory(parent: Node, name: string): Promise<void> {
        return this.removeNode(parent, ContentKind.Directory, name)
    }

    sync(node: Node): Promise<Node> {
        throw new Error("Method not implemented.");
    }

    private async createNode(parent: Node, kind: ContentKind, name: string) {
        await this.writeLockNode(parent)
        try {
            const info = required(this.infos.get(parent))
            if (info.kind != ContentKind.Directory) invalid("Node is not a directory")
            if (!info.writable) invalid("Directory is read-only");
            const entries = required(this.entires.get(parent))
            const entry = entries.get(name)
            if (entry) invalid(`Name '${name}' already exists`);
            const node = this.nextNode()
            const newEntry: DirectoryEntry = {
                kind,
                name,
                node
            }
            entries.set(name, newEntry)
            this.nodeToParent.set(node, parent)
            const now = Date.now()
            const newInfo: ContentInformation = {
                node,
                kind,
                modifyTime: now,
                createTime: now,
                executable: false,
                writable: true
            }
            this.infos.set(node, newInfo)
            if (kind == ContentKind.Directory) this.entires.set(node, new Map())
            this.replaceNodeContentWriteLocked(node, '', [{ kind: ContentPieceKind.Empty }], newInfo)
            this.invalidate(parent)
            return node
        } finally {
            this.writeUnlockNode(parent)
        }
    }

    private async removeNode(parent: Node, kind: ContentKind, name: string): Promise<void> {
        await this.writeLockNode(parent)
        try {
            const info = required(this.infos.get(parent))
            if (info.kind != ContentKind.Directory) invalid("Node is not a directory")
            if (!info.writable) invalid("Directory is read only")
            const entries = required(this.entires.get(parent))
            const entry = entries.get(name)
            if (entry) {
                if (entry.kind != kind) {
                    switch (kind) {
                        case ContentKind.Directory: invalid(`${name} is not a directory`)
                        case ContentKind.File: invalid(`${name} is not a file`)
                    }
                }
                entries.delete(name)
                this.invalidate(parent)
            }
        } finally {
            this.writeUnlockNode(parent)
        }
    }


    private scheduleSlotReads(node: Node) {

    }

    private cancelSlotReads(node: Node) {

    }

    private invalidate(node: Node) {

    }

    private entryFile() {}

    private replaceContent(address: string, content: Content) {
        const existingContent = required(this.contentMap.get(address))
        this.contentMap.set(address, content)
        if (content != existingContent) {
            for (const piece of content) {
                switch (piece.kind) {
                    case ContentPieceKind.Buffer:
                        if (piece.refCount++ == 0) {
                            this.cachedSize += piece.size
                        }
                        break
                }
            }
            for (const piece of existingContent) {
                switch (piece.kind) {
                    case ContentPieceKind.Buffer:
                        if (--piece.refCount == 0) {
                            this.cachedSize -= piece.size
                        }
                        break
                }
            }
        }
    }

    private replaceNodeContentWriteLocked(
        node: Node,
        address: string,
        content: Content,
        info: ContentInformation = required(this.infos.get(node))
    ) {
        let effectiveAddress = address
        if (!isPending(address)) {
            effectiveAddress = newPending()
            this.addressMap.set(node, effectiveAddress)
        }
        this.replaceContent(effectiveAddress, content)
        if (this.cachedSize > this.cacheSize) {
            this.scheduleEviction()
        }
        info.modifyTime = Date.now()
    }

    private async findSlotClient(slot: string): Promise<SlotsClient> {
        for await (const slotClient of findContainer<SlotsClient>(this.context, slot, this.finder, this.broker, id => this.broker.slots(id))) {
            return slotClient
        }
        invalid(`Could not find slot: ${slot}`)
    }

    private nextNode(): number {
        return this.next++
    }

    private async loadContent(address: string): Promise<Content> {
        const cachedContent = this.contentMap.get(address)
        if (cachedContent) {
            return cachedContent
        }
        const content: Content = []
        const hash = createHash('sha256')
        let size = 0
        for await (const buffer of hashTransform(this.readContent(address), hash)) {
            content.push(newBufferContent(buffer))
            size += buffer.length
        }
        const code = hash.digest().toString('hex')
        if (code != address) invalid("Date didn't match address");
        this.replaceContent(address, content)
        return content
    }

    private async *readContent(address: string): Data {
        let data: Data | undefined = undefined
        for await (const storageClient of findContainer<StorageClient>(this.context, address, this.finder, this.broker, id => this.broker.storage(id))) {
            const getData = await storageClient.get(address)
            if (!getData) continue
            data = getData
            break
        }
        if (!data) invalid(`Could not get ${address}`)
        yield *data
    }

    private async *readContentLink(contentLink: ContentLink): AsyncIterable<ContentPiece> {
        contentLink.address
    }




    private async *flattenContent(content: Content): AsyncIterable<FlatContentPiece> {
        for (const piece of content) {
            switch (piece.kind) {
                case ContentPieceKind.Buffer:
                    piece.lastUsed = Date.now()
                case ContentPieceKind.Zero:
                    yield piece
                case ContentPieceKind.Empty:
                    break
                case ContentPieceKind.Address: {
                    const nestedContent = await this.loadContent(piece.address)
                    yield *this.flattenContent(nestedContent)
                    break
                }
            }
        }
    }

    private async *splitFlatContent(flatContent: AsyncIterable<FlatContentPiece>, split :number): AsyncIterable<FlatContentPiece> {
        let current = 0
        for await (const piece of flatContent) {
            if (current < split) {
                switch (piece.kind) {
                    case ContentPieceKind.Zero: {
                        const next = current + piece.size
                        if (next < split) {
                            yield piece
                        } else {
                            yield { kind: ContentPieceKind.Zero, size: split - current }
                            yield { kind: ContentPieceKind.Zero, size: next - split }
                        }
                        current += piece.size
                        break
                    }
                    case ContentPieceKind.Buffer: {
                        const next = current + piece.buffer.length
                        if (next < split) {
                            yield piece
                        } else {
                            yield newBufferContent(piece.buffer.subarray(0, split - current))
                            yield newBufferContent(piece.buffer.subarray(split - current))
                        }
                        current += piece.buffer.length
                        break
                    }
                }
            } else {
                yield piece
            }
        }
    }

    private async *dataFromFlatContent(flatContent: AsyncIterable<FlatContentPiece>): Data {
        for await (const piece of flatContent) {
            switch (piece.kind) {
                case ContentPieceKind.Buffer:
                    yield piece.buffer
                    break
                case ContentPieceKind.Zero:
                    yield Buffer.alloc(piece.size, 0)
                    break
            }
        }
    }

    private async forget(node: Node) {
        await this.writeLockNode(node)
        try {
            const info = this.infos.get(node)
            if (info) {
                this.infos.delete(node)
                if (info.kind == ContentKind.Directory) {
                    const entries = this.entires.get(node)
                    if (entries) {
                        this.entires.delete(node)
                        for (const entry of entries.values()) {
                            this.forget(entry.node)
                        }
                    }
                }
                const address = this.addressMap.get(node)
                if (address) {
                    this.replaceNodeContentWriteLocked(node, address, [], info)
                }
            }
        } finally {
            this.writeUnlockNode(node)
        }
    }

    private nodeLocks = new Map<Node, ReadWriteLock>()

    private ensureNodeLock(node: Node): ReadWriteLock {
        const result = this.nodeLocks.get(node)
        if (result) return result
        const newLock = new ReadWriteLock()
        this.nodeLocks.set(node, newLock)
        return newLock
    }

    private async writeLockNode(node: Node) {
        return this.ensureNodeLock(node).writeLock()
    }

    private writeUnlockNode(node: Node) {
        this.ensureNodeLock(node).writeUnlock()
    }

    private async readLockNode(node: Node) {
        return this.ensureNodeLock(node).readLock()
    }

    private readUnlockNode(node: Node) {
        this.ensureNodeLock(node).readUnlock()
    }

    private addressLocks = new Map<string, ReadWriteLock>()

    private ensureAddressLock(address: string): ReadWriteLock {
        const result = this.addressLocks.get(address)
        if (result) return result
        const newLock = new ReadWriteLock()
        this.addressLocks.set(address, newLock)
        return newLock
    }

    private readLockAddress(address: string) {
        return this.ensureAddressLock(address).readLock()
    }

    private readUnlockAddress(address: string) {
        this.ensureAddressLock(address).readUnlock()
    }

    private writeLockAddress(address: string) {
        return this.ensureAddressLock(address).writeLock()
    }

    private writeUnlockAddress(address: string) {
        this.ensureAddressLock(address).writeUnlock()
    }

    private evictOldest = async () => {
        let oldestContent: Content | undefined = undefined
        let oldestAddress: string | undefined = undefined
        let oldestDate = Date.now()

        function lastUsedOf(content: Content): number {
            let date = Date.now()
            for (const piece of content) {
                if (piece.kind == ContentPieceKind.Buffer && piece.lastUsed < date ) {
                    date = piece.lastUsed
                }
            }
            return date
        }

        for (const [address, content] of this.contentMap.entries()) {
            if (address.startsWith("pending:")) continue
            const date = lastUsedOf(content)
            if (!oldestContent || date < oldestDate) {
                oldestAddress = address
                oldestContent = content
                oldestDate = date
            }
        }

        if (oldestContent && oldestAddress) {
            this.replaceContent(oldestAddress, [newAddressContent(oldestAddress)])
            if (this.cachedSize > this.cacheSize) {
                this.scheduleEviction()
            }
        }
    }

    private sizeCached(size: number) {
        this.cachedSize += size
        if (this.cachedSize > this.cacheSize) {
            this.scheduleEviction()
        }
    }

    private scheduleEviction() {
        this.cronTab.request(0, this.evictOldest)
    }
}

enum ContentPieceKind {
    Empty,
    Zero,
    Buffer,
    Address,
}

interface EmptyContent {
    kind: ContentPieceKind.Empty
}

interface ZeroContent {
    kind: ContentPieceKind.Zero
    size: number
}

function newZeroContent(size: number): ZeroContent {
    return {
        kind: ContentPieceKind.Zero,
        size
    }
}

interface BufferContent {
    kind: ContentPieceKind.Buffer
    buffer: Buffer
    size: number
    lastUsed: number
    refCount: number
}

function newBufferContent(buffer: Buffer): BufferContent {
    return {
        kind: ContentPieceKind.Buffer,
        buffer,
        get size() { return buffer.length },
        lastUsed: Date.now(),
        refCount: 0
    }
}

interface AddressContent {
    kind: ContentPieceKind.Address
    address: string
    size?: number
    offset?: number
}

function newAddressContent(address: string, size?: number, offset?: number): AddressContent {
    return {
        kind: ContentPieceKind.Address,
        address,
        size,
        offset
    }
}

type ContentPiece = EmptyContent | ZeroContent | BufferContent | AddressContent
type Content = ContentPiece[]
type FlatContentPiece = ZeroContent | BufferContent

interface MountPoint {
    isUpdateable: boolean
    isFixed: boolean

    current(): Promise<string>
    update(previous: string, address: string): Promise<boolean>
}

interface MountPointInfo {
    last_id: string | undefined
    last_read: number
    mountPoint: MountPoint
}

function now(): number {
    return Date.now()
}

function slotTtl(): number {
    return now() + 1000
}

function fixedMountPoint(id: string): MountPoint {
    return {
        isUpdateable: false,
        isFixed: true,
        async current() { return id },
        async update() { return false }
    }
}

function updateableSlotMountPoint(slot: string, slotsClient: SlotsClient): MountPoint {
    return {
        isUpdateable: true,
        isFixed: false,
        async current() { return (await slotsClient.get(slot)).address },
        async update(previous: string, address: string): Promise<boolean> {
            return slotsClient.put(slot, { previous, address })
        }
    }
}

function readonlySlotMountPoint(slot: string, slotsClient: SlotsClient): MountPoint {
    return {
        isUpdateable: false,
        isFixed: false,
        async current() { return (await slotsClient.get(slot)).address },
        async update(): Promise<boolean> { return false }
    }
}

function mountInfoOf(mountPoint: MountPoint): MountPointInfo {
    return {
        last_id: undefined,
        last_read: 0,
        mountPoint
    }
}

class InvalidRequest extends Error {
    constructor(msg: string) {
        super(msg)
    }
}

function invalid(msg: string): never {
    throw new InvalidRequest(msg)
}

function required<T>(value: T | undefined): T {
    if (!value) invalid("Unknown node")
    return value
}

function error(msg: string): never {
    throw new Error(msg)
}

var pendingNumber = 0

const pendingPrefix = 'pending:'
function isPending(address: string): boolean {
    return address.startsWith(pendingPrefix)
}

function newPending(): string {
    return `${pendingPrefix}${pendingNumber++}`
}

