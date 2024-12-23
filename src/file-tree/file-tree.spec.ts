import { mockBroker } from "../broker/mock/mock_broker_client"
import { ContentLink } from "../common/types"
import { findServer } from "../find/server"
import { Data } from "../storage/client"
import { mockStorage } from "../storage/mock"
import {  FileTree } from "./file-tree"

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
            const storageId = (await storage.ping())!!
            await find.has(storageId, [emptyDirectory])
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