import { dataFromBuffers, readAllData } from "../../common/data"
import { Data } from "../storage_client"
import { mockStorage } from "../mock"
import { StorageCache } from "./storage_cache"
import { createHash } from 'node:crypto'
import { arr } from "../../common/arr"

describe("storage/cache", () => {
    it("can create a storage cache", () => {
        const backing = mockStorage()
        const writeThrough = mockStorage()
        const cache = new StorageCache(writeThrough, backing)
        expect(cache).toBeDefined()
        cache.stop()
    })
    it("can post a block to the cache and it writes through", async () => {
        const backing = mockStorage()
        const writeThrough = mockStorage()
        const cache = new StorageCache(writeThrough, backing)
        const buffer = randomBytes(1000)
        const address = await cache.post(dataFromBuffers([buffer]))
        expect(address).not.toBeFalse()
        if (!address) return;
        expect(await backing.has(address))
        expect(await writeThrough.has(address))
        const backingData = await bufferOf(await cache.get(address))
        expect(backingData).toEqual(buffer)
        cache.stop()
    })
    it("can put a block to the cache and it writes through", async () => {
        const backing = mockStorage()
        const writeThrough = mockStorage()
        const cache = new StorageCache(writeThrough, backing)
        const buffer = randomBytes(1000)
        const address = addressOf([buffer])
        const result = await cache.put(address, dataFromBuffers([buffer]))
        expect(result).toBeTrue()
        expect(await backing.has(address))
        expect(await writeThrough.has(address))
        const backingData = await bufferOf(await cache.get(address))
        expect(backingData).toEqual(buffer)
        cache.stop()
    })
    it("can get from the write through storage", async () => {
        const backing = mockStorage()
        const writeThrough = mockStorage()
        const cache = new StorageCache(writeThrough, backing)
        const buffer = randomBytes(1000)
        const address = await writeThrough.post(dataFromBuffers([buffer]))
        expect(address).not.toBeFalse()
        if (!address) return;
        const cacheData = await cache.get(address)
        expect(cacheData).toBeDefined()
        if (!cacheData) return;
        const cacheBuffer = await bufferOf(cacheData)
        expect(cacheBuffer).toEqual(buffer)
        cache.stop()
    })
    it("can evict data from the backing storage", async () => {
        const backing = mockStorage()
        const writeThrough = mockStorage()
        const cache = new StorageCache(writeThrough, backing, 1000, 1)
        const content = arr(100, index => randomBytes(1000))
        const addresses: string[] = []
        for (const buffer of content) {
            const address = await cache.post(dataFromBuffers([buffer]))
            expect(address).toBeDefined()
            if (!address) return
            addresses.push(address)
        }
        await cache.whenIdle()

        // Expect write through to have all the buffers but the backing to only have one
        const backingSet = new Set<string>()
        for (const address of addresses) {
            expect(await writeThrough.has(address)).toBeTrue()
            if (await backing.has(address)) backingSet.add(address);
        }
        expect(backingSet.size).toEqual(1)
        cache.stop()
    })
    it("can evict from a backing storage with existing entries", async () => {
        // This testing reading a persistent storage used as a backing cache such as the
        // local file system. This tests picking back up after a cache restart.
        const backing = mockStorage()
        const writeThrough = mockStorage()
        const content = arr(100, index => randomBytes(1000))
        const addresses = arr(100, index => addressOf([content[index]]))
        for (const [buffer, address] of zip(content, addresses)) {
            let result = await writeThrough.put(address, dataFromBuffers([buffer]))
            expect(result).toBeTrue()
            result = await backing.put(address, dataFromBuffers([buffer]))
            if (!result) return;
        }
        const cache = new StorageCache(writeThrough, backing, 1000, 1)
        await cache.whenIdle()

        // Expect write through to have all the buffers but the backing to only have one
        const backingSet = new Set<string>()
        for (const address of addresses) {
            expect(await writeThrough.has(address)).toBeTrue()
            if (await backing.has(address)) backingSet.add(address);
        }
        expect(backingSet.size).toEqual(1)
        cache.stop()
    })
})

async function bufferOf(data: Data | false): Promise<Buffer> {
    if (!data) return Buffer.alloc(0, 0);
    return readAllData(data)
}

// Faster than crypto and it doesn't need to be a strongly random as crypto
function randomBytes(size: number): Buffer {
    const buffer = Buffer.alloc(size, 0)
    for (let i = 0; i < size; i++) {
        buffer[i] = Math.floor(Math.random() * 256)
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

function *zip<A, B>(a: A[], b: B[]): Iterable<[A, B]> {
    const len = Math.min(a.length, b.length)
    for (let i = 0; i < len; i++) {
        yield [a[i], b[i]]
    }
}