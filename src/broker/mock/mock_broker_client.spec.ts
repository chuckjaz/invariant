import { mockStorage } from "../../storage/mock"
import { BrokerClient } from "../broker_client"
import { mockBroker } from "./mock_broker_client"

describe('broker/mock/client', () => {
  it('can create a mock broker client', async () => {
    const broker = mockBroker()
    expect(broker).toBeDefined()
  })
  it('can ping the broker', async () => {
    const broker = mockBroker()
    expect(await broker.ping()).toBeDefined()
  })
  it('can add a broker to the broker', async () => {
    const broker = mockBroker()
    const otherBroker = mockBroker()
    await broker.registerBroker(otherBroker)
    const otherBrokerId = await otherBroker.ping()
    if (!otherBrokerId) throw Error('Expected id')
    const lookedUpBroker = await broker.broker(otherBrokerId)
    expect(lookedUpBroker).toEqual(otherBroker)
    await expectRegistered('broker', otherBrokerId, broker)
  })
  it('can add a storage to the broker', async () => {
    const broker = mockBroker()
    const storage = mockStorage()
    await broker.registerStorage(storage)
    const storageId = await storage.ping()
    if (!storageId) throw Error('Expected id')
    const lookedUpStorage = await broker.storage(storageId)
    expect(lookedUpStorage).toEqual(storage)
    await expectRegistered('storage', storageId, broker)
  })
})

async function expectRegistered(kind: string, id: string, broker: BrokerClient) {
    const result = await broker.registered(kind)
    for await (const registered of result) {
        if (id == registered) return
    }
    throw new Error(`Id ${id} not registered`)
}
