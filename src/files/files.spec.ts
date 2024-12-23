import { BrokerClient } from "../broker/broker_client"
import { mockBroker } from "../broker/mock/mock_broker_client"
import { brotliCompressData, cipherData, dataFromBuffers, deflateData, hashTransform, jsonFromData, measureTransform, readAllData, splitData, validateData, zipData } from "../common/data"
import { delay } from "../common/delay"
import { error, invalid } from "../common/errors"
import { dataFromString, dataToString } from "../common/parseJson"
import { Block, ContentLink, ContentTransform, Entry, EntryKind } from "../common/types"
import { mockSlots } from "../slots/mock/slots_mock_client"
import { SlotsClient } from "../slots/slot_client"
import { Data, StorageClient } from "../storage/client"
import { mockStorage } from "../storage/mock"
import { Files } from "./files"
import { createHash } from 'node:crypto'
import { ContentKind, FileDirectoryEntry, Node } from "./files_client"

describe("files", () => {
    it("can create a files server", () => {
        const broker = mockBroker()
        const storage = mockStorage(broker)
        const slots = mockSlots()
        const files = new Files(storage, slots, broker, 1)
        try {
            expect(files).toBeDefined()
        } finally {
            files.stop()
        }
    })
    it("can mount a directory of the file", async () => {
        const [files, node] = await filesWithRandomContent()
        try {
            expect(files).toBeDefined()
            expect(node).toBeDefined()
        } finally {
            files.stop()
        }
    })
    it("can read a directory", async () => {
        const [files, node] = await filesWithRandomContent()
        try {
            await validateDirectory(files, node)
        } finally {
            files.stop()
        }
    })
    it("can read a compressed directory", async () => {
        const transforms = [decompressTx()]
        const [files, node] = await filesWithRandomContent({ transforms })
        try {
            await validateDirectory(files, node)
        } finally {
            files.stop()
        }
    })
    it("can read an encrypted directory", async () => {
        const transforms = [decipherTx()]
        const [files, node] = await filesWithRandomContent({ transforms })
        try {
            await validateDirectory(files, node)
        } finally {
            files.stop()
        }
    })
    it("can read a compressed, encrypted directory", async () => {
        const transforms = [decipherTx(), decompressTx()]
        const [files, node] = await filesWithRandomContent({ transforms })
        try {
            await validateDirectory(files, node)
        } finally {
            files.stop()
        }
    })
    it("can read a deep compressed, encrypted directory", async () => {
        const transforms = [decipherTx(), decompressTx()]
        const [files, node] = await filesWithRandomContent({ transforms, depth: 4 })
        try {
            await validateDirectory(files, node)
        } finally {
            files.stop()
        }
    })
    it("can read files with block lists", async () => {
        const transforms = [blockListTx()]
        const [files, node] = await filesWithRandomContent({
            transforms,
            fileData: randomDataProvider(2 * 1024),
            splits: fixedSplit(1024),
            width: 1,
        })
        try {
            await validateDirectory(files, node)
        } finally {
            files.stop()
        }
    })
    it("can create a file", async () => {
        const [files, node, slot, slots, storage] = await filesWithEmptyDirectory()
        try {
            const fileNode = await files.createNode(node, "test", ContentKind.File)
            const data = await readAllData(files.readFile(fileNode))
            expect(data).toEqual(Buffer.alloc(0, 0))
            await delay(2)
            await validateDirectory(files, node)
        } finally {
            files.stop()
        }

        const current = await slots.get(slot)
        expect(current).toBeDefined()
        if (!current) return
        const data = await storage.get(current.address)
        expect(data).toBeTruthy()
        if (!data) return
        const newDirectory = await dataToString(data)
        expect(newDirectory).toContain('"test"')
    })
    it("can create and write to a file", async () => {
        const [files, node, slot, slots, storage] = await filesWithEmptyDirectory()
        try {
            const fileNode = await files.createNode(node, "test", ContentKind.File)
            const size = 1024
            const buffers = [randomBytes(size)]
            const result = await files.writeFile(fileNode, dataFromBuffers(buffers))
            const data = await readAllData(files.readFile(fileNode))
            expect(result).toEqual(size)
            expect(data).toEqual(buffers[0])

            let count = 0
            for await (const entry of files.readDirectory(node)) {
                expect(entry.name).toEqual("test")
                count++
            }
            expect(count).toBe(1)
            await delay(2)
            await validateDirectory(files, node)
        } finally {
            files.stop()
        }

        const current = await slots.get(slot)
        expect(current).toBeDefined()
        if (!current) return
        const data = await storage.get(current.address)
        expect(data).toBeTruthy()
        if (!data) return
        const newDirectory = await dataToString(data)
        expect(newDirectory).toContain('"test"')
        expect(newDirectory).toContain('"size":1024')
    })
    it("can remove a file", async () => {
        const [files, node] = await filesWithEmptyDirectory()
        try {
            const fileNode = await files.createNode(node, "test", ContentKind.File)
            expect(fileNode).toBeGreaterThan(-1)
            await files.removeNode(node, "test")
            let count = 0
            for await (const entry of files.readDirectory(node)) {
                count++
            }
            expect(count).toBe(0)
            await delay(2)
            await validateDirectory(files, node)
        } finally {
            files.stop()
        }
    })
    it("can create a directory", async () => {
        const [files, node] = await filesWithEmptyDirectory()
        try {
            const directoryNode = await files.createNode(node, "test", ContentKind.Directory)
            const directoryLookup = await files.lookup(node, "test")
            expect(directoryLookup).toBeDefined()
            if (directoryLookup === undefined) return
            expect(directoryLookup).toEqual(directoryNode)
            const directoryInfo = await files.info(directoryNode)
            expect(directoryInfo).toBeDefined()
            if (!directoryInfo) return
            expect(directoryInfo.kind).toEqual(EntryKind.Directory)
            await delay(2)
            await validateDirectory(files, node)
        } finally {
            files.stop()
        }
    })

})

function decipherTx(): ContentTransform {
    const key = randomBytes(32).toString('hex')
    const iv = randomBytes(16).toString('hex')
    return { kind: "Decipher", algorithm: "aes-256-cbc", key, iv }
}

function decompressTx(): ContentTransform {
    return { kind: "Decompress", algorithm: "inflate" }
}

function blockListTx(): ContentTransform {
    return { kind: "Blocks" }
}

async function filesWithEmptyDirectory(): Promise<[Files, Node, string, SlotsClient, StorageClient, BrokerClient]> {
    const broker = mockBroker()
    const storage = mockStorage()
    const slots = mockSlots()
    broker.registerStorage(storage)
    broker.registerSlots(slots)
    const slot = randomBytes(32).toString('hex')
    const files = new Files(storage, slots, broker, 1)
    const content = await emptyDirectory(storage)
    slots.register({ id: slot, address: content.address })
    const slotContent: ContentLink = { ...content, address: slot, slot: true }
    const node = await files.mount(slotContent)
    return [files, node, slot, slots, storage, broker]
}

async function emptyDirectory(storage: StorageClient): Promise<ContentLink> {
    const address = await storage.post(dataFromString("[]"))
    if (!address) error("Storage refused empty directory")
    return { address }
}

async function filesWithRandomContent(
    options: RandomDirectoryOptions = { }
): Promise<[Files, Node, BrokerClient, SlotsClient, StorageClient]> {
    const broker = mockBroker()
    const storage = mockStorage(broker)
    const slots = mockSlots()
    const files = new Files(storage, slots, broker, 1)
    const content = await randomDirectory(storage, options)
    const node = await files.mount(content)
    return [files, node, broker, slots, storage]
}

interface RandomDirectoryOptions {
    width?: number
    depth?: number
    directoryRatio?: number
    transforms?: ContentTransform[]
    fileData?: (name: string) => [Data, number],
    splits?: (index: number) => number
}

function randomDataProvider(size: number): () => [Data, number] {
    return () => {
        const buffers = [randomBytes(size)]
        return [dataFromBuffers(buffers), size]
    }
}

const defaultFileData = randomDataProvider(32)

function fixedSplit(size: number): (index: number) => number {
    return index => (index + 1) * size
}

const randomDirectoryOptions = {
    width: 10,
    depth: 0,
    directoryRatio: 0.5,
    tx: (data => data) as (data: Data) => Data,
    transforms: [] as ContentTransform[],
    fileData: defaultFileData,
    splits: (index: number) => (index + 1) * 512
}


function contentFor(address: string, expected: string, transforms: ContentTransform[]): ContentLink {
    const content: ContentLink = { address }
    if (transforms.length > 0) content.transforms = transforms
    if (address != expected) content.expected = expected;
    return content
}

function writeTransform(
    storage: StorageClient,
    transforms: ContentTransform[],
    splits: (index: number) => number
): (data: Data) => Data {
    let tx: (data: Data) => Data = data => data
    for (let i = transforms.length - 1; i >= 0; i--) {
        const transform = transforms[i]
        const previous = tx
        switch (transform.kind) {
            case "Blocks": {
                const newTransforms = transforms.slice(1)
                tx = data => blockList(storage, previous(data), splits, newTransforms)
                break
            }
            case "Decipher": {
                if (transform.algorithm != "aes-256-cbc") invalid("Unsupported");
                tx = data => cipherData(transform.algorithm, transform.key, transform.iv, previous(data))
                break
            }
            case "Decompress": {
                const algorithm = transform.algorithm
                const compressor =
                    algorithm == "brotli" ? brotliCompressData :
                    algorithm == "inflate" ? deflateData : zipData;
                tx = data => compressor(previous(data))
                break
            }
        }
    }
    return tx
}

async function saveBlocks(
    storage: StorageClient,
    data: Data,
    transforms: ContentTransform[],
    splits: (index: number) => number
): Promise<ContentLink> {
    const hash = createHash('sha256')
    data = hashTransform(data, hash)
    if (transforms.length > 0) {
        data = writeTransform(storage, transforms, splits)(data)
    }
    const address = await storage.post(data)
    if (!address) error(`Could not save data`);
    const expected = hash.digest().toString('hex')
    return contentFor(address, expected, transforms)
}

async function *blockList(storage: StorageClient, data: Data, splits: (index: number) => number, transforms: ContentTransform[]): Data {
    let index = 0
    let buffer = await readAllData(data)
    let nextSplit = splits(index++)
    const blocks: Block[] = []
    while (buffer.length > 0) {
        const bufferToSave = buffer.length > nextSplit ? buffer.subarray(0, nextSplit) : buffer
        const content = await saveBlocks(storage, dataFromBuffers([bufferToSave]), transforms, splits)
        blocks.push({ content, size: bufferToSave.length })
        buffer = buffer.subarray(bufferToSave.length)
    }
    const blockListText = JSON.stringify(blocks)
    yield *dataFromString(blockListText)
}

async function randomDirectory(
    storage: StorageClient,
    options: RandomDirectoryOptions
): Promise<ContentLink> {
    const opts = {...randomDirectoryOptions, ...options}
    async function randomFile(name: string): Promise<[ContentLink, number]> {
        const [data, size] = opts.fileData(name)
        return [await saveBlocks(storage, data, opts.transforms ?? [], opts.splits), size]
    }

    async function randomDirectory(currentDepth: number): Promise<ContentLink> {
        const entries: Entry[] = []
        for (let i = 0; i < opts.width; i++) {
            const name = randomBytes(10).toString('base64')
            let kind: EntryKind
            let content: ContentLink
            let size: number | undefined = undefined
            if (currentDepth < opts.depth && Math.random() < opts.directoryRatio) {
                kind = EntryKind.Directory
                content = await randomDirectory(currentDepth + 1)
            } else {
                kind = EntryKind.File
                const [c, s] = await randomFile(name)
                content = c
                size = s
            }
            const newEntry: Entry = {
                kind,
                name,
                content
            }
            if (size != undefined) (newEntry as any).size = size
            entries.push(newEntry)
        }
        entries.sort((a, b) => compare(a.name, b.name))
        const directoryText = JSON.stringify(entries)
        const directoryBuffers = [Buffer.from(new TextEncoder().encode(directoryText))]
        return saveBlocks(storage, dataFromBuffers(directoryBuffers), opts.transforms, opts.splits)
    }

    return randomDirectory(0)
}

async function validateDirectory(files: Files, root: Node) {
    async function validateFile(node: Node) {
        const info = await files.info(node)
        expect(info).toBeDefined()
        if (!info) return
        let data = files.readFile(node)
        if (info.etag) {
            data = validateData(data, info.etag)
        }
        const buffer = await readAllData(data)
        expect(buffer.length).toEqual(info.size!!)
    }

    async function validateDirectory(node: Node) {
        let previous: FileDirectoryEntry | undefined = undefined
        for await (const entry of files.readDirectory(node)) {
            if (previous) expect(entry.name > previous.name).toBeTrue();
            previous = entry
            const info = await files.info(entry.node)
            if (!info) error(`No info found for ${node}`)
            switch (info.kind) {
                case ContentKind.Directory: {
                    await validateDirectory(entry.node)
                    break
                }
                case ContentKind.File: {
                    await validateFile(entry.node)
                    break
                }
            }
        }
    }

    await validateDirectory(root)
}

// Faster than crypto and it doesn't need to be a strongly random as crypto
function randomBytes(size: number): Buffer {
    const buffer = Buffer.alloc(size, 0)
    for (let i = 0; i < size; i++) {
        buffer[i] = randomInt(256)
    }
    return buffer
}

function randomInt(range: number): number {
    return Math.floor(Math.random() * range)
}

function required<T>(value: T | undefined | false): T {
    if (!value) throw Error("Required value undefined");
    return value
}

function addressOf(buffers: Buffer[]): string {
    const hash = createHash('sha256')
    for (const buffer of buffers) {
        hash.update(buffer)
    }
    return hash.digest().toString('hex')
}

function compare(a: string, b: string): number {
    return a > b ? 1 : a == b ? 0 : -1
}