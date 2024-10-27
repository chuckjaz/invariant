import { CronTab } from "./cron_tab"
import { delay } from "./delay"

describe("cron-tab", () => {
    it("can create a cron tab", () => {
        const tab = new CronTab()
        expect(tab).toBeDefined()
    })
    it("can request tasks", async () => {
        const tasks: { duration: number, task: () => Promise<void>}[] = []
        const result: number[] = []
        const cronTab = new CronTab()
        try {
            for (let i = 0; i < 10; i++) {
                const item = i
                tasks.push({ duration: i * 10, task: async () => { result.push(item) } })
            }
            shuffle(tasks)
            for (const task of tasks) {
                cronTab.request(task.duration, task.task)
            }
            while (result.length < 10) {
                await delay(100)
            }
            for (let i = 0; i < 10; i++) {
                expect(result[i]).toEqual(i)
            }
        } finally {
            cronTab.stop()
        }
    })
    it("can every tasks", async () => {
        const cronTab = new CronTab()
        try {
            const result: number[] = []
            cronTab.every(10, async () => { result.push(0) })
            while (result.length < 10) {
                await delay(100)
            }
            expect(result.length).toBeGreaterThan(10)
        } finally {
            cronTab.stop()
        }
    })
})

function shuffle<T>(arr: T[]) {
    const len = arr.length
    const limit = len - 2
    for (let i = 0; i < limit; i++) {
        const j = getRandomInt(len - i)
        const t = arr[i]
        arr[i] = arr[j]
        arr[j] = t
    }
}

function getRandomInt(max: number): number {
    return Math.floor(Math.random() * max);
  }