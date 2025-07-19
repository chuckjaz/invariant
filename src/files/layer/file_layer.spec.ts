import { mockBroker } from "../../broker/mock/mock_broker_client"
import { dataFromBuffers, stringsToData } from "../../common/data"
import { error } from "../../common/errors"
import { randomId } from "../../common/id"
import { dataFromString } from "../../common/parseJson"
import { ContentLink, Entry, EntryKind, FileEntry } from "../../common/types"
import { mockSlots } from "../../slots/mock/slots_mock_client"
import { StorageClient } from "../../storage/storage_client"
import { mockStorage } from "../../storage/mock"
import { Files } from "../files"
import { ContentKind, ContentWriter, FilesClient } from "../files_client"
import { FileLayersDescription, LayeredFiles, LayerKind } from "./file_layer"
import { randomBytes } from 'node:crypto'

describe("file_layer", () => {
    it("can create a file layer", () => {
        const storage = mockStorage()
        const slots = mockSlots()
        const broker = mockBroker()
        const controlPlane = new Files(randomId(), storage, slots, broker, 1)

        const layer = new LayeredFiles(randomId(), controlPlane)

        expect(layer).toBeDefined()

        controlPlane.stop()
    })
    it("can can mount a control plain with a configuration", async () => {
        const storage = mockStorage()
        const slots = mockSlots()
        const broker = mockBroker()

        const directory = await createRandomDirectory(storage)

        const controlRoot = await createConfiguration(storage, [
            {
                kind: LayerKind.Base,
                content: directory
            }
        ])

        const controlPlane = new Files(randomId(), storage, slots, broker, 1)
        const layer = new LayeredFiles(randomId(), controlPlane)
        await layer.mount(controlRoot)
    })
    it("can write to a layer", async () => {
        const storage = mockStorage()
        const slots = mockSlots()
        const broker = mockBroker()

        const controlPlane = new Files(randomId(), storage, slots, broker, 1)

        const sourceSlot = randomId()
        const backingSlot = randomId()

        const emptyDirectory = await createEmptyDirectory(storage)

        await slots.register({ id: sourceSlot, address: emptyDirectory.address })
        await slots.register({ id: backingSlot, address: emptyDirectory.address })
        const layersContent = await createConfiguration(storage, [
            {
                kind: LayerKind.Ignore,
                content: { address: sourceSlot, slot: true },
                ignore: [
                    "node_modules/",
                    "dist/",
                    "out/",
                ],
                syncFrequency: 1
            },
            {
                kind: LayerKind.Base,
                content: { address: backingSlot, slot: true },
                syncFrequency: 1
            }
        ])
        const layers = new LayeredFiles(randomId(), controlPlane)
        await layers.mount(layersContent)
        await writeFile(layers, 'src/hello.ts', 'console.log("hello, world!")')
        await writeFile(layers, 'dist/hello.js', 'console.log("hello, world!")')
        await layers.sync()
        const newSourceSlot = await slots.get(sourceSlot)
        expect(newSourceSlot.address).not.toEqual(emptyDirectory.address)
        const newBackingSlot = await slots.get(backingSlot)
        expect(newBackingSlot.address).not.toEqual(emptyDirectory.address)
    })
    it("can get the attributes of the root directory of a layer", async () => {
        const storage = mockStorage()
        const slots = mockSlots()
        const broker = mockBroker()

        const directory = await createRandomDirectory(storage)
        const controlRoot = await createConfiguration(storage, [
            {
                kind: LayerKind.Base,
                content: directory
            }
        ])

        const controlPlane = new Files(randomId(), storage, slots, broker, 1)

        const layer = new LayeredFiles(randomId(), controlPlane)
        const root = await layer.mount(controlRoot)
        const info = await layer.info(root)
        expect(info).toBeDefined()
    })
    it("can find a directory in backing layer", async () => {
        const storage = mockStorage()
        const slots = mockSlots()
        const broker = mockBroker()

        const controlPlane = new Files(randomId(), storage, slots, broker, 1)

        const sourceSlot = randomId()
        const backingSlot = randomId()

        const backingDirectory = await directoryFrom({
            node_modules: { }
        }, controlPlane)

        const emptyDirectory = await createEmptyDirectory(storage)

        await slots.register({ id: sourceSlot, address: emptyDirectory.address })
        await slots.register({ id: backingSlot, address: backingDirectory.address })

        const layersContent = await createConfiguration(storage, [
            {
                kind: LayerKind.Ignore,
                content: { address: sourceSlot, slot: true },
                ignore: [
                    "node_modules/",
                    "dist/",
                    "out/",
                ],
                syncFrequency: 1
            },
            {
                kind: LayerKind.Base,
                content: { address: backingSlot, slot: true },
                syncFrequency: 1
            }
        ])

        const layers = new LayeredFiles(randomId(), controlPlane)
        const root = await layers.mount(layersContent)

        const lookupResult = await layers.lookup(root,  'node_modules')
        expect(lookupResult).toBeDefined()
    })
})

function randomName(): string {
    return randomBytes(10).toString('hex')
}

async function createRandomDirectory(
    storage: StorageClient,
    genName: (kind: EntryKind) => string = randomName
): Promise<ContentLink> {
    async function randomBlock(): Promise<[ContentLink, number]> {
        const dataBytes = randomBytes(64)
        const data = dataFromBuffers([dataBytes])
        const id = await storage.post(data)
        if (!id) error("Could not write file");
        return [{ address: id}, dataBytes.length]
    }

    async function randomFileEntry(): Promise<FileEntry> {
        const [content, size] = await randomBlock()
        const name = genName(EntryKind.File)
        return {
            kind: EntryKind.File,
            name,
            content,
            size
        }
    }

    async function randomDirectory(size: number): Promise<ContentLink> {
        const entries: Entry[] = []
        for (let i = 0; i < size; i++) {
            entries.push(await randomFileEntry())
        }
        const name = randomBytes(10).toString('hex')
        const entriesText = JSON.stringify(entries)
        const address = await storage.post(dataFromString(entriesText))
        if (!address) error("Could not write directory content")
        return { address }
    }

    return randomDirectory(10)
}

async function createConfiguration(storage: StorageClient, description: FileLayersDescription): Promise<ContentLink> {
    const text = JSON.stringify(description)
    const address = required(await storage.post(dataFromString(text)))
    const entry: FileEntry = {
        kind: EntryKind.File,
        name: '.layers',
        content: { address }
    }
    const rootDirectoryText = JSON.stringify([entry])
    const rootAddress = required(await storage.post(dataFromString(rootDirectoryText)))
    return { address: rootAddress }
}

async function createEmptyDirectory(storage: StorageClient): Promise<ContentLink> {
    const entries: Entry[] = []
    const entriesText = JSON.stringify(entries)
    const address = required(await storage.post(dataFromString(entriesText)))
    return { address }
}

async function writeFile(files: FilesClient, filePath: string, content: string) {
    const parts = filePath.split('/')
    let directory = 1
    let index = 0
    while (index < parts.length - 1) {
        const directoryName = parts[index++]
        let directoryNode = await files.lookup(directory, directoryName)
        if (directoryNode === undefined) {
            directoryNode = await files.createNode(directory, directoryName, ContentKind.Directory)
        }
        directory = directoryNode
    }
    const name = parts[parts.length - 1]
    const fileNode = await files.createNode(directory, name, ContentKind.File)
    await files.writeFile(fileNode, dataFromString(content))
}


interface DirectorySpec {
    [name: string]: string | DirectorySpec
}

async function directoryFrom(spec: DirectorySpec, writer: ContentWriter): Promise<ContentLink> {
    const entries: Entry[] = []
    for (const name in spec) {
        const content = spec[name]
        if (typeof content == 'string') {
            const contentLink = await writer.writeContentLink(stringsToData(content))
            const entry: Entry = {
                kind: EntryKind.File,
                name,
                content: contentLink,
                size: content.length
            }
            entries.push(entry)
        } else {
            const contentLink = await directoryFrom(content, writer)
            const entry: Entry = {
                kind: EntryKind.Directory,
                name,
                content: contentLink
            }
            entries.push(entry)
        }
    }
    return await writer.writeContentLink(stringsToData(JSON.stringify(entries)))
}

function required<T>(n: T | false | null | undefined): T {
    if (!n) error("Required failed");
    return n
}