import { mockBroker } from "../../broker/mock/mock_broker_client"
import { dataFromBuffers } from "../../common/data"
import { error } from "../../common/errors"
import { findInFinder } from "../../common/findInFinder"
import { withTmpDir } from "../../common/test_tmp"
import { findServer } from "../../find/server"
import { StorageClient } from "../storage_client"
import { LocalStorage } from "./local_storage"
import { randomBytes } from 'node:crypto'

describe("storage/local", () => {
    it("can create a local storage", async () => {
        await withTmpDir(async directory => {
            const storage = new LocalStorage(directory)
            expect(storage).toBeDefined()
        })
    })
    it("can add a block to a local storage", async () => {
        await withTmpDir(async directory => {
            const storage = new LocalStorage(directory)
            const id = await postRandomBlock(storage)
            const has = await storage.has(id)
            expect(has).toBeTrue()
        })
    })
    it("can add several blocks to a local storage", async () => {
        await withTmpDir(async directory => {
            const storage = new LocalStorage(directory)
            const blocks: string[] = []
            for (let i = 0; i < 1000; i++) {
                const id = await postRandomBlock(storage)
                blocks.push(id)
            }
            for (const id of blocks) {
                const has = await storage.has(id)
                expect(has).toBeTrue()
            }
        })
    })
    it("can notify a finder when started", async () => {
        await withTmpDir(async directory => {
            const init = new LocalStorage(directory)

            // Initialize the directory
            const blocks: string[] = []
            for (let i = 0; i < 1000; i++) {
                const id = await postRandomBlock(init)
                blocks.push(id)
            }

            // Start a block and a storage
            const broker = mockBroker()
            const find = await findServer(broker)
            const storage = new LocalStorage(directory, undefined, [find])
            await broker.registerStorage(storage)

            await storage.whenQuiet()

            // Now ensure al the blocks can be found
            for (const block of blocks) {
                let found = false
                for await (const container of findInFinder(broker, block, find)) {
                    found = true
                }
                expect(found).toBeTrue()
            }
        })
    })

    it("can notify a finder when a store is made", async () => {
        await withTmpDir(async directory => {
            const broker = mockBroker()
            const find = await findServer(broker)
            const storage = new LocalStorage(directory, undefined, [find])
            await broker.registerStorage(storage)

            const blocks: string[] = []
            for (let i = 0; i < 1000; i++) {
                const id = await postRandomBlock(storage)
                blocks.push(id)
            }

            await storage.whenQuiet()

            // Now ensure all the blocks can be found
            for (const block of blocks) {
                let found = false
                for await (const container of findInFinder(broker, block, find)) {
                    found = true
                }
                expect(found).toBeTrue()
            }
        })
    })
})

async function postRandomBlock(storage: StorageClient): Promise<string> {
    const dataBytes = randomBytes(2048)
    const data = dataFromBuffers([dataBytes])
    const id = await storage.post(data)
    if (!id) error("Could not write file");
    return id
}
