import { randomBytes } from 'node:crypto'
import { brotliCompressData, brotliDecompressData, cipherData, dataFromBuffers, decipherData, deflateData, inflateData, readAllData, unzipData, zipData } from './data'

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
})
