import Koa from 'koa'
import { mockBroker, MockBrokerClient } from "../../broker/mock/mock_broker_client"
import { randomId } from "../../common/id"
import { mockSlots, MockSlotsServer as MockSlotsClient } from "../../slots/mock/slots_mock_client"
import { mockStorage, MockStorageClient } from "../../storage/mock"
import { Files } from "../files"
import { FilesWebClient } from "./files_web_client"
import { filesWebHandlers } from "./files_web_handler"
import { stringsToData } from '../../common/data'
import { invalid } from '../../common/errors'
import { ContentLink, Entry, EntryKind } from '../../common/types'
import { ContentKind, ContentWriter, FilesClient } from '../files_client'
import { dataToString } from '../../common/parseJson'

// This test both the web client and web handlers by starting a web service and then
// connecting a web client to the service

describe('files/web', () => {
    it("can create a file web client", () => {
        const url = new URL('http://localhost:8080')
        const fileClient = new FilesWebClient(url)
        expect(fileClient).toBeDefined()
    })
    it("can create a file web handlers", () => {
        const storage = mockStorage()
        const slots = mockSlots()
        const broker = mockBroker()
        const files = new Files(randomId(), storage,  slots, broker, 1)
        const handlers = filesWebHandlers(files)
        expect(handlers).toBeDefined()
    })
    it("can mount an empty directory", async () => {
        await withMockFiles(async (client, { files }) => {
            const emptyDirectory = await files.writeContentLink(stringsToData("[]"))
            const root = await client.mount(emptyDirectory)
            expect(root).toBeDefined()
        })
    })
    it("can mount an empty directory slot", async () => {
        await withMockFiles(async (client, { files, slots }) => {
            const emptyDirectory = await files.writeContentLink(stringsToData("[]"))
            const id = randomId()
            const result = await slots.register({ id, address: emptyDirectory.address })
            expect(result).toBeTrue()
            const content: ContentLink = {
                address: id,
                slot: true
            }
            const root = await client.mount(content)
            expect(root).toBeDefined()
        })
    })
    it("can mount an empty executable directory", async () => {
        await withMockFiles(async (client, { files, slots }) => {
            const emptyDirectory = await files.writeContentLink(stringsToData("[]"))
            const id = randomId()
            const result = await slots.register({ id, address: emptyDirectory.address })
            expect(result).toBeTrue()
            const content: ContentLink = {
                address: id,
                slot: true
            }
            const root = await client.mount(content, true)
            expect(root).toBeDefined()
            const info = await client.info(root)
            expect(info?.writable).toBeTrue()
            expect(info?.executable).toBeTrue()
        })
    })
    it("can mount a read-only directory", async () => {
        await withMockFiles(async (client, { files, slots }) => {
            const emptyDirectory = await files.writeContentLink(stringsToData("[]"))
            const id = randomId()
            const result = await slots.register({ id, address: emptyDirectory.address })
            expect(result).toBeTrue()
            const content: ContentLink = {
                address: id,
                slot: true
            }
            const root = await client.mount(content, undefined, false)
            expect(root).toBeDefined()
            const info = await client.info(root)
            expect(info?.writable).toBeFalse()
        })
    })
    it("can unmount", async () => {
        await withMockFiles(async (client, { files }) => {
            const emptyDirectory = await files.writeContentLink(stringsToData("[]"))
            const root = await client.mount(emptyDirectory)
            expect(root).toBeDefined()
            const resultContent = await client.unmount(root)
            expect(resultContent).toEqual(emptyDirectory)
        })
    })
    it("can lookup a file", async () => {
        await withFiles({ "hello": "Hello, World!" }, async (client, root) => {
            const result = await client.lookup(root, 'hello')
            expect(result).toBeDefined()
        })
    })
    it("can get the info for a node", async () => {
        await withFiles({}, async (client, root) => {
            const result = await client.info(root)
            expect(result).toBeDefined()
        })
    })
    it("can get the content link for a node", async () => {
        await withFiles({}, async (client, root) => {
            const result = await client.content(root)
            expect(result).toBeDefined()
        })
    })
    it("can read a file", async () => {
        await withFiles({ "hello": "Hello, world!" }, async (client, root) => {
            const handle = await client.lookup(root, 'hello')
            if (!handle) invalid("Could not find hello");
            const content = await dataToString(client.readFile(handle))
            expect(content).toEqual("Hello, world!")
        })
    })
    it("can write a file", async () => {
        await withFiles({ "hello": "" }, async (client, root) => {
            const handle = await client.lookup(root, 'hello')
            if (!handle) invalid("Could not find hello");
            const data = "Hello, world"
            const result = await client.writeFile(handle, stringsToData(data))
            expect(result).toEqual(data.length)
            const content = await dataToString(client.readFile(handle))
            expect(content).toEqual(data)
        })
    })
    it("can set the size of a file", async () => {
        await withFiles({ "hello": "Hello, world!" }, async (client, root) => {
            const handle = await client.lookup(root, 'hello')
            if (!handle) invalid("Could not find hello");
            await client.setSize(handle, 5)
            const content = await dataToString(client.readFile(handle))
            expect(content).toEqual("Hello")
        })
    })
    it("can read a directory", async () => {
        await withFiles({"hello" : "Hello, world!", "goodbye": "See ya later!"}, async (client, root) => {
            const names: string[] = []
            for await (const entry of client.readDirectory(root)) {
                names.push(entry.name)
            }
            expect(names).toEqual(["hello", "goodbye"])
        })
    })
    it("can create a file node", async () => {
        await withFiles({ }, async (client, root) => {
            const node = await client.createNode(root, "hello", ContentKind.File)
            expect(node).toBeDefined()
            const result = await client.lookup(root, 'hello')
            expect(result).toEqual(node)
            const info = await client.info(node)
            expect(info?.kind).toEqual(ContentKind.File)
        })
    })
    it("can create a directory node", async () => {
        await withFiles({ }, async (client, root) => {
            const node = await client.createNode(root, "test", ContentKind.Directory)
            expect(node).toBeDefined()
            const result = await client.lookup(root, 'test')
            expect(result).toEqual(node)
            const info = await client.info(node)
            expect(info?.kind).toEqual(ContentKind.Directory)
        })
    })
    it("can create a file with content", async () => {
        await withFiles({ }, async (client, root, { files }) => {
            const data = "Hello, world!"
            const helloContent = await files.writeContentLink(stringsToData(data))
            const node = await client.createNode(root, "hello", ContentKind.File, helloContent)
            expect(node).toBeDefined()
            const result = await client.lookup(root, 'hello')
            expect(result).toEqual(node)
            const info = await client.info(node)
            expect(info?.kind).toEqual(ContentKind.File)
            const readData = await dataToString(client.readFile(node))
            expect(readData).toEqual(data)
        })
    })
    it("can create a directory with content", async () => {
        await withFiles({ }, async (client, root, { files }) => {
            const data = "Hello, world!"
            const subDirectory = await directoryFrom({
                "hello": data,
                "goodbye": "See ya later!"
            }, files)
            const node = await client.createNode(root, "dir", ContentKind.Directory, subDirectory)
            expect(node).toBeDefined()
            const result = await client.lookup(root, 'dir')
            expect(result).toEqual(node)
            const info = await client.info(node)
            expect(info?.kind).toEqual(ContentKind.Directory)
            const dirHandle = await client.lookup(root, "dir")
            expect(dirHandle).toBeDefined()
            const helloHandle = await client.lookup(dirHandle!!, 'hello')
            expect(helloHandle).toBeDefined()
            const readData = await dataToString(client.readFile(helloHandle!!))
            expect(readData).toEqual(data)
        })
    })
    it("can remove a node", async () => {
        await withFiles({ "hello": "Hello, world!" }, async (client, root) => {
            const result = await client.removeNode(root, 'hello')
            expect(result).toBeTrue()
            const lookup = await client.lookup(root, 'hello')
            expect(lookup).toBeUndefined()
        })
    })
    it("can set the attributes of a node", async () => {
        await withFiles({ "hello": "Hello, world!" }, async (client, root) => {
            const node = await client.lookup(root, 'hello')
            expect(node).toBeDefined()
            await client.setAttributes(node!!, {
                type: 'text/plain'
            })
            const info = await client.info(node!!)
            expect(info?.type).toEqual('text/plain')
        })
    })
    it("can rename a file", async () => {
        await withFiles({ "hello": "Hello, world!" }, async (client, root) => {
            const result = await client.rename(root, 'hello', root, 'Hello')
            expect(result).toBeTrue()
        })
    })
    it("can link a file", async () => {
        const data = "Hello, world!"
        await withFiles({ "hello": data }, async (client, root) => {
            const helloHandle = await client.lookup(root, 'hello')
            expect(helloHandle).toBeDefined()
            const result = await client.link(root, helloHandle!!, "HelloThere")
            expect(result).toBeTrue()
            const helloThereHandle = await client.lookup(root, "HelloThere")
            expect(helloThereHandle).toBeDefined()
            const readData = await dataToString(client.readFile(helloThereHandle!!))
            expect(readData).toEqual(data)
        })
    })
})

interface MockServices {
    storage: MockStorageClient
    slots: MockSlotsClient
    broker: MockBrokerClient
    files: Files
}

async function withMockFiles(block: (client: FilesWebClient, services: MockServices) => Promise<void>) {
    const storage = mockStorage()
    const slots = mockSlots()
    const broker = mockBroker()
    broker.registerStorage(storage)
    broker.registerSlots(slots)
    const files = new Files(randomId(), storage, slots, broker, 1)
    const handlers = filesWebHandlers(files)
    const app = new Koa()
    app.use(handlers)
    const server = app.listen()
    try {
        const address = server.address()
        if (address == null || typeof address !== 'object') {
            invalid('Expected an object type from server.address()')
        }
        const url = new URL(`http://localhost`)
        url.port = address.port.toString()
        const client = new FilesWebClient(url)
        await block(client, { storage, slots, broker, files })
    } finally {
        server.close()
        files.stop()
    }
}

async function withFiles(spec: DirectorySpec, block: (client: FilesClient, root: number, services: MockServices) => Promise<void>) {
    await withMockFiles(async (client, services) => {
        const directory = await directoryFrom(spec, services.files)
        const slot = randomId()
        const result = await services.slots.register({
            id: slot,
            address: directory.address
        })
        expect(result).toBeTrue()
        const content: ContentLink = {
            address: slot,
            slot: true
        }
        const root = await client.mount(content)
        await block(client, root, services)
    })
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