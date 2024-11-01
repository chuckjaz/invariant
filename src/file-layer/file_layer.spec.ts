import { BrokerClient } from "../broker/client"
import { mockBroker } from "../broker/mock/client"
import { dataFromBuffers } from "../common/data"
import { Entry, EntryKind } from "../common/types"
import { mockSlots } from "../slots/mock/slots_mock_client"
import { SlotsClient } from "../slots/slot_client"
import { StorageClient } from "../storage/client"
import { mockStorage } from "../storage/mock"
import { FileLayer, Node } from "./file_layer"
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
        let count = 0
        for await (const entry of layer.readDirectory(node)) {
            expect(entry.kind).toEqual(EntryKind.File)
            console.log(entry)
            count++
        }
        expect(count).toEqual(10)
    })
})

async function fileLayerWithRandomContent(width: number, depth: number, directoryRatio: number = 0.5): Promise<[FileLayer, Node, BrokerClient, SlotsClient, StorageClient]> {
    const broker = mockBroker()
    const storage = mockStorage(broker)
    const slots = mockSlots()
    const fileLayer = new FileLayer(storage, slots, broker, 1)
    const address = await randomDirectory(storage, width, depth, directoryRatio)
    const node = fileLayer.mount({ address })
    return [fileLayer, node, broker, slots, storage]
}

async function randomDirectory(storage: StorageClient, width: number, depth: number, directoryRatio: number = 0.5): Promise<string> {
    async function randomFile(): Promise<[string, number]> {
        const content = [randomBytes(32)]
        const address = addressOf(content)
        await storage.put(address, dataFromBuffers(content))
        return [address, 32]
    }

    async function randomDirectory(currentDepth: number): Promise<string> {
        const entry: Entry[] = []
        for (let i = 0; i < width; i++) {
            const name = randomBytes(10).toString('base64')
            if (currentDepth < depth && Math.random() < directoryRatio) {
                const address = await randomDirectory(currentDepth + 1)
                entry.push({
                    kind: EntryKind.Directory,
                    name,
                    content: { address }
                })
            } else {
                const [address, size] = await randomFile()
                entry.push({
                    kind: EntryKind.File,
                    name,
                    content: { address },
                    size
                })
            }
        }
        const directoryText = JSON.stringify(entry)
        const content = [Buffer.from(new TextEncoder().encode(directoryText))]
        const address = addressOf(content)
        const result = await storage.put(address, dataFromBuffers(content))
        expect(result).toBeTrue()
        return address
    }

    return randomDirectory(0)
}

// Faster than crypto and it doesn't need to be a strongly random as crypto
function randomBytes(size: number): Buffer {
    const buffer = Buffer.alloc(size, 0)
    for (let i = 0; i < size; i++) {
        buffer[i] = randomInt(256)
    }
    return buffer
}

function addressOf(buffers: Buffer[]): string {
    const hash = createHash('sha256')
    for (const buffer of buffers) {
        hash.update(buffer)
    }
    return hash.digest().toString('hex')
}

function randomInt(range: number): number {
    return Math.floor(Math.random() * range)
}
