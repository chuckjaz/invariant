import { withTmpDir } from "../../common/test_tmp"
import { SlotsGetResponse, SlotsPutRequest } from "../../common/types"
import { SlotsClient } from "../slot_client"
import { LocalSlots } from "./slots_local"
import { promisify } from 'node:util'
import { randomBytes, KeyObject, generateKeyPair as gkp, sign as sgn } from 'node:crypto'

const generateKeyPair = promisify(gkp)
const sign = promisify(sgn)

describe("slots/local", () => {
    it("can create a local slots", async () => {
        await withTmpDir(async tmpDir => {
            const slots = new LocalSlots(tmpDir)
            expect(slots).toBeDefined()
        })
    })
    it("can ping", async () => {
        await withTmpDir(async tmpDir => {
            const slots = new LocalSlots(tmpDir)
            const id = await slots.ping()
            expect(id).toEqual(slots.id)
        })
    })
    it("can register a simple slot", async () => {
        await withTmpDir(async tmpDir => {
            const slots = new LocalSlots(tmpDir)
            const id = newId()
            const address = newId()
            const result = await slots.register({ id, address })
            expect(result).toBeTrue()
        })
    })
    describe("simple slots", () => {
        it("can get the current state", async () => {
            await withSimpleSlot(async (slots, id, address) => {
                const response = await slots.get(id)
                expect(response.address).toEqual(address)
                expect(response.previous).toEqual("root")
            })
        })
        it("can put a new value", async () => {
            await withSimpleSlot(async (slots, id, address) => {
                const newAddress = newId()
                const putResponse = await slots.put(id, { address: newAddress, previous: address })
                expect(putResponse).toBeTrue()
                const getResponse = await slots.get(id)
                expect(getResponse.address).toEqual(newAddress)
                expect(getResponse.previous).toEqual(address)
            })
        })
        it("can put a competing value", async () => {
            await withSimpleSlot(async (slots, id, address) => {
                const newAddress1 = newId()
                const newAddress2 = newId()
                const r1 = slots.put(id, { address: newAddress1, previous: address })
                const r2 = slots.put(id, { address: newAddress2, previous: address })

                const [r1a, r2a] = await Promise.all([r1, r2])
                expect(r1a).not.toEqual(r2a)
                const result = await slots.get(id)
                expect(result).toBeDefined()
                if (result) {
                    if (result.address == newAddress1 || result.address == newAddress2) {
                        return
                    }
                    console.log('id', id)
                    console.log('address', address)
                    console.log('newAddress1', newAddress1)
                    console.log('newAddress2', newAddress2)
                    console.log('result', result)
                    expect(result.address).toEqual(newAddress2)
                }
            })
        })
        it("can commit a sequence of values", async () => {
            await withSimpleSlot(async (slots, id, address) => {
                const count = 100
                const addresses: string[] = []
                let previous = address
                for (let i = 0; i < count; i++) {
                    const address = newId()
                    addresses.push(address)
                    const result = await slots.put(id, { address, previous })
                    expect(result).toBeTrue()
                    if (!result) return
                    previous = address
                }
                const result = await slots.get(id)
                expect(result.address).toEqual(addresses[addresses.length - 1])
            })
        })
        it("can report a history of value", async () => {
            await withSimpleSlot(async (slots, id, address) => {
                const count = 100
                const requests: SlotsGetResponse[] = [ {address, previous: "root"} ]
                let previous = address
                for (let i = 0; i < count; i++) {
                    const address = newId()
                    const request = { address, previous }
                    requests.push(request)
                    const result = await slots.put(id, { address, previous })
                    expect(result).toBeTrue()
                    if (!result) return
                    previous = address
                }
                let index = count
                for await (const entry of await slots.history(id)) {
                    expect(entry).toEqual(requests[index--])
                }
                expect(index).toEqual(-1)
            })
        })
    })
    describe("signed slots", () => {
        it("can get the current state", async () => {
            await withSignedSlot(async (slots, id, address) => {
                const response = await slots.get(id)
                expect(response.address).toEqual(address)
                expect(response.previous).toEqual("root")
            })
        })
        it("can put a new value", async () => {
            await withSignedSlot(async (slots, id, address, sign) => {
                const newAddress = newId()
                const request = { address: newAddress, previous: address }
                await sign(request)
                const putResponse = await slots.put(id, request)
                expect(putResponse).toBeTrue()
                const getResponse = await slots.get(id)
                expect(getResponse.address).toEqual(newAddress)
                expect(getResponse.previous).toEqual(address)
            })
        })
        it("can commit a sequence of values", async () => {
            await withSignedSlot(async (slots, id, address, sign) => {
                const count = 100
                const addresses: string[] = []
                let previous = address
                for (let i = 0; i < count; i++) {
                    const address = newId()
                    addresses.push(address)
                    const request = { address, previous }
                    await sign(request)
                    const result = await slots.put(id, request)
                    expect(result).toBeTrue()
                    if (!result) return
                    previous = address
                }
                const result = await slots.get(id)
                expect(result.address).toEqual(addresses[addresses.length - 1])
            })
        })
        it("can detect an invalid signature", async () => {
            await withSignedSlot(async (slots, id, address, sign) => {
                const newAddress = newId()
                const request = { address: newAddress, previous: address, signature:  newId() }
                const putResponse = await slots.put(id, request)
                expect(putResponse).toBeFalse()
            })
        })
    })
})

function newId(): string {
    return randomBytes(32).toString('hex')
}

async function withSimpleSlot(block: (slots: SlotsClient, id: string, address: string) => Promise<void>) {
    await withTmpDir(async tmpDir => {
        const slots = new LocalSlots(tmpDir)
        const id = newId()
        const address = newId()
        const result = await slots.register({ id, address })
        expect(result).toBeTrue()
        if (!result) return
        await block(slots, id, address)
    })
}

async function withSignedSlot(block: (
    slots: SlotsClient,
    id: string,
    address: string,
    sign: (request: SlotsPutRequest) => Promise<void>
) => Promise<void>
) {
    await withTmpDir(async tmpDir => {
        const slots = new LocalSlots(tmpDir)
        const id = newId()
        const address = newId()
        const keyPair = await generateKeyPair("rsa", { modulusLength: 1024 })
        const key = keyPair.publicKey.export({ type: 'pkcs1', format: 'pem' })
        const result = await slots.register({ id, address, signature: { kind: "sha256:rsa", key }})
        expect(result).toBeTrue()
        if (!result) return
        const signCallback = async (request: SlotsPutRequest) =>{
            const data = Buffer.from(request.address + '0000' + request.previous)
            const signature = await sign("sha256", data, keyPair.privateKey)
            request.signature = signature.toString('hex')
        }
        await block(slots, id, address, signCallback)
    })
}
