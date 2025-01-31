import { randomId } from "../../common/id"
import { withTmpDir } from "../../common/test_tmp"
import { MockNamesClient } from "./mock_names_client"

describe('names/mock', () => {
    it('can ping', async () => {
        const id = randomId()
        await tmpClient(async client => {
            const pingResult = await client.ping()
            expect(pingResult).toEqual(id)
        }, id)
    })
    it('can register a new name', async () => {
        await tmpClient(async client => {
            await client.register('name', randomId())
        })
    })
    it('can register a new name with ttl', async () => {
        await tmpClient(async client => {
            await client.register('name', randomId(), 10 * 1000)
            const result = await client.lookup('name')
            expect(result.ttl).toEqual(10 * 1000)
        })
    })
    it('can register a new name and look it up', async () => {
        await tmpClient(async client => {
            const name = 'name'
            const address = randomId()
            await client.register(name, address)
            const result = await client.lookup(name)
            expect(result.name).toEqual(`${name}.local`)
            expect(result.address).toEqual(address)
        })
    })
    it('can update a record', async () => {
        await tmpClient(async client => {
            const id = randomId()
            await client.register('name', id)
            const newId = randomId()
            const updateResult = await client.update('name', id, newId)
            expect(updateResult).toEqual(true)
            const lookupResult = await client.lookup('name')
            expect(lookupResult.address).toEqual(newId)
        })
    })
    describe('negative', () => {
        describe('lookup', () => {
            it("can detect and invalid address", async () => {
                await tmpClient(async client => {
                    await expectFailure('Unknown name name.local', async () => {
                        await client.lookup('name')
                    })
                })
            })
        })
        describe('register', () => {
            it("can detect a duplicate registration", async () => {
                await tmpClient(async client => {
                    await client.register('name', randomId())
                    await expectFailure('Name already registered', async () => {
                        await client.register('name', randomId())
                    })
                })
            })
        })
        describe('update', () => {
            it("can detect an invalid name", async () => {
                await tmpClient(async client => {
                    await expectFailure('Unknown name name.local', async () => {
                        await client.update('name',  randomId(), randomId())
                    })
                })
            })
            it('can detect an invalid previous address', async () => {
                await tmpClient(async client => {
                    await client.register('name', randomId())
                    await expectFailure('Invalid previous address', async () => {
                        await client.update('name', 'aaa', 'bbb')
                    })
                })
            })
            it('can detect an out of date update', async () => {
                await tmpClient(async client => {
                    await client.register('name', randomId())
                    const result = await client.update('name', randomId(), randomId())
                    expect(result).toBeFalse()
                })
            })
            it('can detect an invalid new address', async () => {
                await tmpClient(async client => {
                    const id = randomId()
                    await client.register('name', id)
                    expectFailure('Invalid address', async () => {
                        await client.update('name', id, 'aaa')
                    })
                })
            })
        })
    })
})

async function tmpClient(block: (client: MockNamesClient) => Promise<void>, id: string = randomId()) {
    const client = new MockNamesClient(id)
    await block(client)
}

async function expectFailure(msg: string, block: () => Promise<void>) {
    var er: any = undefined
    try {
        await block()
    } catch (e: any) {
        er = e
    }
    expect(er).toBeDefined()
    if (er) {
        expect(er.message).toEqual(msg)
    }
}