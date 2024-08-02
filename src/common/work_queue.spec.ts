import { delay } from "./delay"
import { WorkQueue } from "./work_queue"

describe("work queue", () => {
    it("can create a work queue", () => {
        new WorkQueue()
    })
    it("can queue one item", async () => {
        const q = new WorkQueue<string>()
        q.push("test")
        const value = await q.pop()
        expect(value).toEqual("test")
    })
    it("can queue background work", async () => {
        const q = new WorkQueue<string>()
        let result = ""
        async function background() {
            while (true) {
                const value = await q.pop()
                if (value == "done") break
                if (result) result += ", "
                result += value
                await delay(10)
            }
        }
        const worker = background()
        q.push("this")
        q.push("is")
        await delay(100)
        q.push("a")
        q.push("test")
        await delay(10)
        q.push("done")
        await worker
        expect(result).toEqual("this, is, a, test")
    })
})