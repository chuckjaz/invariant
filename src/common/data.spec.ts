import { randomBytes } from 'node:crypto'
import { brotliCompressData, brotliDecompressData, cipherData, dataFromBuffers, decipherData, deflateData, inflateData, readAllData, splitData, unzipData, zipData } from './data'

describe("common/data", () => {
    it("can cipher and decipher data", async () => {
        const key = randomBytes(32).toString('hex')
        const iv = randomBytes(16).toString('hex')
        const buffers = [randomBytes(1024), randomBytes(1024)]
        const buffer = Buffer.concat(buffers)
        const data = cipherData("aes-256-cbc", key, iv, dataFromBuffers(buffers))
        const deciphered = await readAllData(decipherData("aes-256-cbc", key, iv, data))
        expect(deciphered).toEqual(buffer)
    })
    describe("compress", () => {
        it("can inflate and deflate", async () => {
            const buffers = [randomBytes(1024), randomBytes(1024)]
            const buffer = Buffer.concat(buffers)
            const data = deflateData(dataFromBuffers(buffers))
            const decompressed = await readAllData(inflateData(data))
            expect(decompressed).toEqual(buffer)
        })
        it("can compress and decompress", async () => {
            const buffers = [randomBytes(1024), randomBytes(1024)]
            const buffer = Buffer.concat(buffers)
            const data = brotliCompressData(dataFromBuffers(buffers))
            const decompressed = await readAllData(brotliDecompressData(data))
            expect(decompressed).toEqual(buffer)
        })
        it("can zip and unzip", async () => {
            const buffers = [randomBytes(1024), randomBytes(1024)]
            const buffer = Buffer.concat(buffers)
            const data = zipData(dataFromBuffers(buffers))
            const decompressed = await readAllData(unzipData(data))
            expect(decompressed).toEqual(buffer)
        })
    })
    describe("split", () => {
        it("can no-op split", async () => {
            const buffer = randomBytes(100)
            const buffers = [buffer]
            const input = dataFromBuffers(buffers)
            const output = splitData(input, () => 100)
            for await (const outputBuffer of output) {
                expect(outputBuffer).toEqual(buffer)
            }
        })
        it("can split a block in two", async () => {
            const buffer = randomBytes(200)
            const buffers = [buffer]
            const input = dataFromBuffers(buffers)
            const output = splitData(input, index => (index + 1)*100)
            let count = 0
            for await (const outputBuffer of output) {
                switch (count++) {
                    case 0: expect(outputBuffer).toEqual(buffer.subarray(0, 100)); break
                    case 1: expect(outputBuffer).toEqual(buffer.subarray(100)); break
                    default: expect(count).toBeLessThan(2)
                }
            }
            expect(count).toEqual(2)
        })
        it("can split a block in four parts", async () => {
            const buffer = randomBytes(4096)
            const buffers = [buffer]
            const input = dataFromBuffers(buffers)
            const output = splitData(input, index => (index + 1) *1024)
            let count = 0
            for await (const outputBuffer of output) {
                expect(count).toBeLessThan(4)
                const index = count++ * 1024
                expect(outputBuffer).toEqual(buffer.subarray(index, index + 1024))
            }
            expect(count).toEqual(4)
        })
    })
})
