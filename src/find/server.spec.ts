import { mockBroker } from "../broker/mock/client"
import { findServer } from "./server"

describe('find/server', () => {
    it('can create a find server', () => {
        const broker = mockBroker()
        const server = findServer(broker)
        expect(server).toBeDefined()
    })
})