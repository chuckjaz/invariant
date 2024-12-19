import { randomId } from "../../common/id"
import { mockProduction } from "./mock_production"

describe('productions/mock', () => {
    it("can create a mock", () => {
        expect(mockProduction()).toBeDefined()
    })
    it("can store a result",  async () => {
        const production = mockProduction()
        const task = randomId()
        const input = randomId()
        const output = randomId()
        await production.put(task, input, output)
    })
    it("can retrieve an output", async () => {
        const production = mockProduction()
        const task = randomId()
        const input = randomId()
        const output = randomId()
        await production.put(task, input, output)

        const retrievedResult = await production.get(task, input)
        expect(retrievedResult).toEqual(output)
    })
})