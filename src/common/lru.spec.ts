import { Lru } from "./lru"

describe("common/lru", () => {
    it("can create an lru", () => {
        const lru = new Lru()
        expect(lru).toBeDefined()
        lru.validate()
    })
    it("can add a value", () => {
        const lru = new Lru<number>()
        lru.add(1, 1)
        expect(lru.least()).toBe(1)
        lru.validate()
    })
    it("can add data and get it out in least order", () => {
        const lru = new Lru<number>()
        const data = arr(100, index => index)
        for (const item of data) {
            lru.add(item, item)
            lru.validate()
        }
        for (let i = 0; i < 100; i++) {
            const least = lru.least()
            expect(least).toBe(i)
            lru.remove(i)
            lru.validate()
        }
    })
})

function randomInt(range: number): number {
    return Math.floor(Math.random() * range)
}

function shuffle<T>(arr: T[]) {
    for (let i = 0, len = arr.length; i < len; i++) {
        swap(arr, i, randomInt(i - len))
    }
}

function swap<T>(arr: T[], i: number, j: number) {
    if (i == j) return
    const t = arr[i]
    arr[i] = arr[j]
    arr[j] = t
}

function arr<T>(size: number, init: (index: number) => T): T[] {
    const result: T[] = []
    for (let i = 0; i < size; i++) {
        result.push(init(i))
    }
    return result
}