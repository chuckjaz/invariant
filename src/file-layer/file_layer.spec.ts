import { BrokerClient } from "../broker/client"
import { mockBroker } from "../broker/mock/client"
import { cipherData, dataFromBuffers, deflateData, jsonFromData, readAllData, validateData } from "../common/data"
import { error } from "../common/errors"
import { ContentLink, ContentTransform, Entry, EntryKind } from "../common/types"
import { mockSlots } from "../slots/mock/slots_mock_client"
import { SlotsClient } from "../slots/slot_client"
import { Data, StorageClient } from "../storage/client"
import { mockStorage } from "../storage/mock"
import { ContentKind, FileDirectoryEntry, FileLayer, Node } from "./file_layer"
import { createHash } from 'node:crypto'

describe("file_layer", () => {
    it("can create a file layer", () => {
        const broker = mockBroker()
        const storage = mockStorage(broker)
        const slots = mockSlots()
        const fileLayer = new FileLayer(storage, slots, broker, 1)
        expect(fileLayer).toBeDefined()
    })
    it("can mount a directory of the file", async () => {
        const [layer, node] = await fileLayerWithRandomContent(10, 0)
        expect(layer).toBeDefined()
        expect(node).toBeDefined()
    })
    it ("can read a directory", async () => {
        const [layer, node] = await fileLayerWithRandomContent(10, 0)
        await validateDirectory(layer, node)
    })
    it("can read a compressed directory", async () => {
        const [tx, transform] = compressTx()
        const [layer, node] = await fileLayerWithRandomContent(10, 0, 0.5, tx, [ transform ])
        await validateDirectory(layer, node)
    })
    it("can read an encrypted directory", async () => {
        const [tx, transform] = encryptTx()
        const [layer, node] = await fileLayerWithRandomContent(10, 0, 0.5, tx, [transform])
        await validateDirectory(layer, node)
    })
    it("can read a compressed, encrypted directory", async () => {
        const [compress, compressTransform] = compressTx()
        const [cipher, cipherTransform] = encryptTx()
        const transforms = [compressTransform, cipherTransform]
        const tx: (data: Data) => Data = data => compress(cipher(data))
        const [layer, node] = await fileLayerWithRandomContent(10, 0, 0.5, tx, transforms)
        await validateDirectory(layer, node)
    })
    it("can read a deep compressed, encrypted directory", async () => {
        const [compress, compressTransform] = compressTx()
        const [cipher, cipherTransform] = encryptTx()
        const transforms = [compressTransform, cipherTransform]
        const tx: (data: Data) => Data = data => compress(cipher(data))
        const [layer, node] = await fileLayerWithRandomContent(10, 4, 0.5, tx, transforms)
        await validateDirectory(layer, node)
    })
})

function encryptTx(): [(data: Data) => Data, ContentTransform] {
    const key = randomBytes(32).toString('hex')
    const iv = randomBytes(16).toString('hex')
    const tx: (data: Data) => Data = data => cipherData("aes-256-cbc", key, iv, data)
    return [tx, { kind: "Decipher", algorithm: "aes-256-cbc", key, iv }]
}

function compressTx():  [(data: Data) => Data, ContentTransform] {
    return [deflateData, { kind: "Decompress", algorithm: "inflate" }]
}

async function fileLayerWithRandomContent(
    width: number,
    depth: number,
    directoryRatio: number = 0.5,
    tx: (data: Data) => Data = data => data,
    transforms?: ContentTransform[]
): Promise<[FileLayer, Node, BrokerClient, SlotsClient, StorageClient]> {
    const broker = mockBroker()
    const storage = mockStorage(broker)
    const slots = mockSlots()
    const fileLayer = new FileLayer(storage, slots, broker, 1)
    const content = await randomDirectory(storage, width, depth, directoryRatio, tx, transforms)
    const node = fileLayer.mount(content)
    return [fileLayer, node, broker, slots, storage]
}

async function randomDirectory(
    storage: StorageClient,
    width: number,
    depth: number,
    directoryRatio: number = 0.5,
    tx: (data: Data) => Data = data => data,
    transforms?: ContentTransform[]
): Promise<ContentLink> {
    function contentFor(address: string, expected: string): ContentLink {
        const content: ContentLink = { address }
        if (transforms) content.transforms = transforms
        if (address != expected) content.expected = expected;
        return content
    }

    async function saveBlocks(data: Data, expected: string): Promise<ContentLink> {
        if (transforms) {
            data = tx(data)
        }
        const address = await storage.post(data)
        if (!address) error(`Could not save data`);
        return contentFor(address, expected)
    }

    async function randomFile(): Promise<[ContentLink, number]> {
        const buffers = [randomBytes(32)]
        const size = 32
        const expected = addressOf(buffers)
        return [await saveBlocks(dataFromBuffers(buffers), expected), size]
    }

    async function randomDirectory(currentDepth: number): Promise<ContentLink> {
        const entries: Entry[] = []
        for (let i = 0; i < width; i++) {
            const name = randomBytes(10).toString('base64')
            let kind: EntryKind
            let content: ContentLink
            let size: number | undefined = undefined
            if (currentDepth < depth && Math.random() < directoryRatio) {
                kind = EntryKind.Directory
                content = await randomDirectory(currentDepth + 1)
            } else {
                kind = EntryKind.File
                const [c, s] = await randomFile()
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
        const directoryBuffersAddress = addressOf(directoryBuffers)
        return saveBlocks(dataFromBuffers(directoryBuffers), directoryBuffersAddress)
    }

    return randomDirectory(0)
}

async function validateDirectory(fileLayer: FileLayer, root: Node) {
    async function validateFile(node: Node) {
        const info = await fileLayer.info(node)
        expect(info).toBeDefined()
        if (!info) return
        let data = fileLayer.readFile(node)
        if (info.etag) {
            data = validateData(data, info.etag)
        }
        const buffer = await readAllData(data)
        expect(buffer.length).toEqual(info.size!!)
    }

    async function validateDirectory(node: Node) {
        let previous: FileDirectoryEntry | undefined = undefined
        for await (const entry of fileLayer.readDirectory(node)) {
            if (previous) expect(entry.name > previous.name).toBeTrue();
            previous = entry
            switch (entry.kind) {
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