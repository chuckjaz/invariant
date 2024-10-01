import { mockBroker } from "../broker/mock/client"
import { findServer } from "../find/server"
import { Data } from "../storage/client"
import { mockStorage } from "../storage/mock"
import { ContentLink, FileTree } from "./file-tree"

describe("file-tree", () => {
    it("can create an empty file tree", async () => {
        const broker = mockBroker()
        const storage = mockStorage()
        const find = await findServer(broker)
        await broker.registerStorage(storage)
        await broker.registerFind(find)
        const emptyDirectory = await storage.post(dataOf("[]"))
        expect(emptyDirectory).not.toBeFalsy()
        if (emptyDirectory) {
            await find.has(storage.id, [emptyDirectory])
            const emptyDirectoryLink: ContentLink = {
                address: emptyDirectory
            }
            const fileTree = new FileTree(broker, find, emptyDirectoryLink, storage)
            const root = await fileTree.directory("/")
            expect(root).not.toBeFalsy()
        }
    })
})

async function* dataOf(text: string): Data {
    const encoded = new TextEncoder().encode(text)
    yield Buffer.alloc(encoded.length, encoded)
}