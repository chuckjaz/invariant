import { dataToString } from "../../common/parseJson"
import { Data } from "../client"
import { mockStorage } from "./client"
import { createHash } from 'node:crypto'

describe('storage/mock/client', () => {
    it('can create a mock storage', () => {
        const client = mockStorage()
        expect(client).toBeDefined()
    })
    it('can ping', async () => {
        const client = mockStorage()
        expect(await client.ping()).toEqual(client.id)
    })
    it('can post a value', async () => {
        const client = mockStorage()
        const value = 'This is a test'
        const data = dataOf(value)
        const id = await client.post(data)
        expect(id).toEqual(`sha256/${codeOf(value)}`)
    })
    it('can put a value', async () => {
        const client = mockStorage()
        const value = 'This is a test'
        const data = dataOf(value)
        const code = codeOf(value)
        const result = await client.put(code, data)
        expect(result).toBeTrue()
    })
    it('can put and retrieve a value', async () => {
        const client = mockStorage()
        const value = 'This is a test'
        const code = codeOf(value)
        const data = dataOf(value)
        await client.put(code, data)
        const getResult = await client.get(code)
        expect(getResult).not.toBeFalse()
        if (getResult) {
            expect(getResult).toBeDefined()
            const textResult = await dataToString(getResult)
            expect(textResult).toEqual(value)
        }
    })
    it('can post and receive a value', async () => {
        const client = mockStorage()
        const value = 'This is a test'
        const data = dataOf(value)
        const url = await client.post(data)
        expect(url).toBeDefined()
        if (url) {
            const urlPrefix = 'sha256/'
            expect(url.startsWith(urlPrefix)).toBeTrue()
            const code = url.substring(urlPrefix.length)
            const getResult = await client.get(code)
            expect(getResult).not.toBeFalse()
            if (getResult) {
                const textResult = await dataToString(getResult)
                expect(textResult).toEqual(value)
            }
        }
    })
    it('can post a value and report has value', async () => {
        const client = mockStorage()
        const value = 'This is a test'
        const data = dataOf(value)
        const url = await client.post(data)
        if (url) {
            const urlPrefix = 'sha256/'
            expect(url.startsWith(urlPrefix)).toBeTrue()
            const code = url.substring(urlPrefix.length)
            expect(await client.has(code)).toBeTrue()
        }
    })
    it('can detect an invalid put', async () => {
        const client = mockStorage()
        const value = 'This is a test'
        const invalidCode = codeOf('invalid')
        const data = dataOf(value)
        const result = await client.put(invalidCode, data)
        expect(result).toBeFalse()
    })
    it('can detect an missing get', async () => {
        const client = mockStorage()
        const value = 'This is a test'
        const code = codeOf(value)
        const result = await client.get(code)
        expect(result).toBeFalse()
    })
})

function codeOf(text: string): string {
    const encoder = new TextEncoder()
    const buffer = encoder.encode(text)
    const hash = createHash('sha256')
    hash.update(buffer)
    return hash.digest().toString('hex')
}

async function* dataOf(text: string): Data {
    const encoded = new TextEncoder().encode(text)
    yield Buffer.alloc(encoded.length, encoded)
}