import { ParallelContext } from "./parallel_context"

describe("common/parallel_context", () => {
    it("can create a parallel context", () => {
        const context = new ParallelContext()
        expect(context).toBeDefined()
    })
    it("can await a single value", async () => {
        let executed = false
        const context = new ParallelContext()
        context.add(async () => executed = true)
        await context.join()
        expect(executed).toBeTrue()
    })
    it("can wait 100 values", async () => {
        let done = 0
        const context = new ParallelContext()
        for (let i = 0; i < 100; i++) {
            context.add(async () => done++)
        }
        await context.join()
        expect(done).toEqual(100)
    })
    it("can await 1000 values", async () => {
        let done = 0
        const context = new ParallelContext()
        for (let i = 0; i < 1000; i++) {
            context.add(async () => done++)
        }
        await context.join()
        expect(done).toEqual(1000)
    })
    it("can map 100 items", async () => {
        const context = new ParallelContext()
        const original = new Array(100)
        const result = await context.map(original, async (_, index) => index)
        expect(result.length).toEqual(100)
    })
})