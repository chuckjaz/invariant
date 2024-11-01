import { randomBytes } from 'node:crypto'
import { cipherData, dataFromBuffers, decipherData, readAllData } from './data'

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
})
