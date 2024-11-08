import { randomBytes } from 'node:crypto'
import { BlockOverride, brotliCompressData, brotliDecompressData, cipherData, dataFromBuffers, decipherData, deflateData, inflateData, overrideData, readAllData, setDataSize, splitData, unzipData, zipData } from './data'

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
    describe("overrideData", () => {
        it("can override an empty stream", async () => {
            const emptyData = dataFromBuffers([])
            const overrides: BlockOverride[] = [
                {
                    offset: 0,
                    buffer: Buffer.alloc(10, 1)
                }
            ]

            const result = await readAllData(overrideData(overrides, emptyData))
            expect(result).toEqual(Buffer.alloc(10, 1))
        })
        it("can override a single overlapped block", async () => {
            const data = dataFromBuffers([Buffer.alloc(100, 1)])
            const overrides: BlockOverride[] = [
                {
                    offset: 40,
                    buffer: Buffer.alloc(40, 2)
                }
            ]
            const result = await readAllData(overrideData(overrides, data))
            expect(result).toEqual(Buffer.concat([
                Buffer.alloc(40, 1),
                Buffer.alloc(40, 2),
                Buffer.alloc(20, 1)
            ]))
        })
        it("can override a single overhanging block", async () => {
            const data = dataFromBuffers([Buffer.alloc(100, 1)])
            const overrides: BlockOverride[] = [
                {
                    offset: 80,
                    buffer: Buffer.alloc(40, 2)
                }
            ]
            const result = await readAllData(overrideData(overrides, data))
            expect(result).toEqual(Buffer.concat([
                Buffer.alloc(80, 1),
                Buffer.alloc(40, 2)
            ]))
        })
        it("can override overlapping two blocks", async () => {
            const data = dataFromBuffers([Buffer.alloc(50, 1), Buffer.alloc(50, 2)])
            const overrides: BlockOverride[] = [
                {
                    offset: 40,
                    buffer: Buffer.alloc(40, 3)
                }
            ]
            const result = await readAllData(overrideData(overrides, data))
            expect(result).toEqual(Buffer.concat([
                Buffer.alloc(40, 1),
                Buffer.alloc(40, 3),
                Buffer.alloc(20, 2)
            ]))
        })
        it("can override out-of-order overrides", async () => {
            const data = dataFromBuffers([Buffer.alloc(50, 1), Buffer.alloc(50, 2)])
            const overrides: BlockOverride[] = [
                {
                    offset: 80,
                    buffer: Buffer.alloc(10, 3)
                },
                {
                    offset: 20,
                    buffer: Buffer.alloc(10, 4)
                }
            ]
            const result = await readAllData(overrideData(overrides, data))
            expect(result).toEqual(Buffer.concat([
                Buffer.alloc(20, 1),
                Buffer.alloc(10, 4),
                Buffer.alloc(20, 1),
                Buffer.alloc(30, 2),
                Buffer.alloc(10, 3),
                Buffer.alloc(10, 2)
            ]))
        })
        it("can extend a stream with an override", async () => {
            const data = dataFromBuffers([Buffer.alloc(10, 1)])
            const overrides: BlockOverride[] = [
                {
                    offset: 90,
                    buffer: Buffer.alloc(10, 2)
                }
            ]
            const result = await readAllData(overrideData(overrides, data))
            expect(result).toEqual(Buffer.concat([
                Buffer.alloc(10, 1),
                Buffer.alloc(80, 0),
                Buffer.alloc(10, 2)
            ]))
        })
        it("can handle multiple overlapping writes", async () => {
            const data = dataFromBuffers([Buffer.alloc(100, 1)])
            const overrides: BlockOverride[] = [
                {
                    offset: 10,
                    buffer: Buffer.alloc(80, 2)
                },
                {
                    offset: 20,
                    buffer: Buffer.alloc(60, 3)
                },
                {
                    offset: 30,
                    buffer: Buffer.alloc(40, 4)
                },
                {
                    offset: 40,
                    buffer: Buffer.alloc(10, 5)
                }
            ]
            const result = await readAllData(overrideData(overrides, data))
            expect(result).toEqual(Buffer.concat([
                Buffer.alloc(10, 1), // 0
                Buffer.alloc(10, 2), // 10
                Buffer.alloc(10, 3), // 20
                Buffer.alloc(10, 4), // 30
                Buffer.alloc(10, 5), // 40
                Buffer.alloc(20, 4), // 50
                Buffer.alloc(10, 3), // 70
                Buffer.alloc(10, 2), // 80
                Buffer.alloc(10, 1), // 90
            ]))
        })
        it("can handle multiple overlapping writes of empty stream", async () => {
            const data = dataFromBuffers([])
            const overrides: BlockOverride[] = [
                {
                    offset: 10,
                    buffer: Buffer.alloc(80, 2)
                },
                {
                    offset: 20,
                    buffer: Buffer.alloc(60, 3)
                },
                {
                    offset: 30,
                    buffer: Buffer.alloc(40, 4)
                },
                {
                    offset: 40,
                    buffer: Buffer.alloc(10, 5)
                }
            ]
            const result = await readAllData(overrideData(overrides, data))
            expect(result).toEqual(Buffer.concat([
                Buffer.alloc(10, 0), // 0
                Buffer.alloc(10, 2), // 10
                Buffer.alloc(10, 3), // 20
                Buffer.alloc(10, 4), // 30
                Buffer.alloc(10, 5), // 40
                Buffer.alloc(20, 4), // 50
                Buffer.alloc(10, 3), // 70
                Buffer.alloc(10, 2), // 80
            ]))
        })
    })
    describe("setDataSize", () => {
        it("can shorten a stream", async () => {
            const buffer = Buffer.alloc(1024, 1)
            const data = dataFromBuffers([buffer])
            const result = await readAllData(setDataSize(512, data))
            expect(result).toEqual(buffer.subarray(0, 512))
        })
        it("can lengthen the stream", async () => {
            const buffer = Buffer.alloc(512, 1)
            const data = dataFromBuffers([buffer])
            const result = await readAllData(setDataSize(1024, data))
            expect(result).toEqual(Buffer.concat([
                buffer,
                Buffer.alloc(512, 0)
            ]))
        })
        it("can shorten multiple datas", async () => {
            const buffers = [
                Buffer.alloc(128, 1),
                Buffer.alloc(128, 2),
                Buffer.alloc(128, 3),
                Buffer.alloc(100, 4),
                Buffer.alloc(156, 5),
                Buffer.alloc(128, 6),
                Buffer.alloc(128, 7),
                Buffer.alloc(128, 8),
            ]
            const data = dataFromBuffers(buffers)
            const result = await readAllData(setDataSize(512, data))
            expect(result).toEqual(Buffer.concat(buffers).subarray(0, 512))
        })
    })
})
