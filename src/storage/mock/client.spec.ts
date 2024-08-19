import { mockStorage } from "./client"
import { createHash } from 'node:crypto'

describe('storage/mock/client', () => {
    it('can create a mock storage', () => {
        const client = mockStorage()
        expect(client).toBeDefined()
    })
    it('can ping', async () => {
        const client = mockStorage()
        expect(await client.ping()).toBeTrue()
    })
    it('can post a value', async () => {
        const client = mockStorage()
        const value = 'This is a test'
        const id = await client.post(value)
        expect(id).toEqual(codeOf(value))
    })
    it('can put a value', async () => {
        const client = mockStorage()
        const value = 'This is a test'
        const code = codeOf(value)
        await client.put(code, value)
    })
    it('can put and retrieve a value', async () => {
        const client = mockStorage()
        const value = 'This is a test'
        const code = codeOf(value)
        await client.put(code, value)
        const getResult = await client.get(code)
        expect(getResult).toBeDefined()
        const textResult = await getResult!!.text()
        expect(textResult).toEqual(value)
    })
    it('can post and receive a value', async () => {
        const client = mockStorage()
        const value = 'This is a test'
        const code = await client.post(value)
        const getResult = await client.get(code)
        expect(getResult).toBeDefined()
        const textResult = await getResult!!.text()
        expect(textResult).toEqual(value)
    })
    it('can post a value and report has value', async () => {
        const client = mockStorage()
        const value = 'This is a test'
        const code = await client.post(value)
        expect(await client.has(code)).toBeTrue()
    })
    it('can detect an invalid put', async () => {
        const client = mockStorage()
        const value = 'This is a test'
        const invalidCode = codeOf('invalid')
        let caught: any = undefined
        try {
            await client.put(invalidCode, value)
        } catch (e) {
            caught = e
        }
        expect(caught).toBeDefined()
    })
    it('can detect an missing get', async () => {
        const client = mockStorage()
        const value = 'This is a test'
        const code = codeOf(value)
        let caught: any = undefined
        try {
            await client.get(code)
        } catch (e) {
            caught = e
        }
        expect(caught).toBeDefined()
    })
})

function codeOf(text: string): string {
    const encoder = new TextEncoder()
    const buffer = encoder.encode(text)
    const hash = createHash('sha256')
    hash.update(buffer)
    return hash.digest().toString('hex')
}