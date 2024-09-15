import { MockSlotsServer } from "./slots_mock_client"
import { randomBytes } from 'node:crypto'

describe('slots/client/mock', () => {
    it('can create a slots client', () => {
        const client = new MockSlotsServer()
        expect(client).toBeDefined()
    })
    it('can register a slot', async () => {
        const id = randomBytes(32).toString('hex')
        const address = randomBytes(32).toString('hex')
        const client = new MockSlotsServer()
        const response = await client.register({ id, address })
        expect(response).toBeTrue()
    })
    it('can get the current value', async () => {
        const id = randomBytes(32).toString('hex')
        const address = randomBytes(32).toString('hex')
        const client = new MockSlotsServer()
        await client.register({ id, address })
        const response = await client.get(id)
        expect(response).toBeDefined()
        expect(response?.address).toEqual(address)
    })
    it('can update the current value', async () => {
        const id = randomBytes(32).toString('hex')
        const address = randomBytes(32).toString('hex')
        const newAddress = randomBytes(32).toString('hex')
        const client = new MockSlotsServer()
        await client.register({ id, address })
        const result = await client.put(id, { address: newAddress, previous: address })
        expect(result).toBeTrue()
    })
    it('can detect an invalid put request', async () => {
        const id = randomBytes(32).toString('hex')
        const address = randomBytes(32).toString('hex')
        const newAddress = randomBytes(32).toString('hex')
        const invalidPrevious = randomBytes(32).toString('hex')
        const client = new MockSlotsServer()
        await client.register({ id, address })
        const result = await client.put(id, { address: newAddress, previous: invalidPrevious })
        expect(result).toBeFalse()
    })
})