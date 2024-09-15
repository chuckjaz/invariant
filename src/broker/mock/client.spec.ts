import { mockStorage } from "../../storage/mock"
import { BrokerClient } from "../client"
import { mockBroker } from "./client"

describe('broker/mock/client', () => {
  it('can create a mock broker client', async () => {
    const broker = mockBroker()
    expect(broker).toBeDefined()
  })
  it('can ping the broker', async () => {
    const broker = mockBroker()
    expect(await broker.ping()).toEqual(broker.id)
  })
  it('can add a broker to the broker', async () => {
    const broker = mockBroker()
    const otherBroker = mockBroker()
    await broker.registerBroker(otherBroker)
    const lookedUpBroker = await broker.broker(otherBroker.id)
    expect(lookedUpBroker).toEqual(otherBroker)
    await expectRegistered('broker', otherBroker.id, broker)
  })
  it('can add a storage to the broker', async () => {
    const broker = mockBroker()
    const storage = mockStorage()
    await broker.registerStorage(storage)
    const lookedUpStorage = await broker.storage(storage.id)
    expect(lookedUpStorage).toEqual(storage)
    await expectRegistered('storage', storage.id, broker)
  })
})

async function expectRegistered(kind: string, id: string, broker: BrokerClient) {
    const result = await broker.registered(kind)
    for await (const registered of result) {
        if (id == registered) return
    }
    throw new Error(`Id ${id} not registered`)
}
