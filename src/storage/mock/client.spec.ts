import { mockBroker } from "../../broker/mock/client"
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
        expect(await client.ping()).toBeDefined()
    })
    it('can post a value', async () => {
        const client = mockStorage()
        const value = 'This is a test'
        const data = dataOf(value)
        const id = await client.post(data)
        expect(id).toEqual(codeOf(value))
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
        const code = await client.post(data)
        expect(code).not.toBeFalsy()
        if (code) {
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
        const code = await client.post(data)
        if (code) {
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
    it('can fetch one storage from another', async() => {
        const broker = mockBroker()
        const c1 = mockStorage(broker)
        const c2 = mockStorage(broker)
        await broker.registerStorage(c1)
        await broker.registerStorage(c2)
        const value = 'This is a test'
        const code = codeOf(value)
        const putResult = await c1.put(code, dataOf(value))
        expect(putResult).toBeTrue()
        const fetchResult = await c2.fetch(code, c1.id)
        expect(fetchResult).toBeTrue()
        const hasResult = await c2.has(code)
        expect(hasResult).toBeTrue()
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