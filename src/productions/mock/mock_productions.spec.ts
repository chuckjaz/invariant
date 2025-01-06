import { randomId } from "../../common/id"
import { mockProductions } from "./mock_productions"

describe('productions/mock', () => {
    it("can create a mock", () => {
        expect(mockProductions()).toBeDefined()
    })
    it("can store a result",  async () => {
        const production = mockProductions()
        const task = randomId()
        const input = randomId()
        const output = randomId()
        await production.put(task, input, output)
    })
    it("can retrieve an output", async () => {
        const production = mockProductions()
        const task = randomId()
        const input = randomId()
        const output = randomId()
        await production.put(task, input, output)

        const retrievedResult = await production.get(task, input)
        expect(retrievedResult).toEqual(output)
    })
})