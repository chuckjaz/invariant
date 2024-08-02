import { delay } from "./delay"
import { ParallelMapper } from "./parallel_mapper"

describe('parallel_mapper', () => {
    it('can create a mapper', () => {
        new ParallelMapper(async () => { })
    })
    it('can map a single item', async () => {
        const mapper = new ParallelMapper<number, number>(
            async (value) => {
                delay(10)
                return value + 90
            }
        )
        mapper.add(10)
        const value = await mapper.collect()
        expect(value).toEqual([100])
    })
    it('can map 100 items', async () => {
        const mapper = new ParallelMapper<number, number>(
            async (value) => {
                await delay(r(30))
                return value + 90
            }
        )
        for (let i = 0; i < 100; i++) {
            mapper.add(i)
        }
        const value = await mapper.collect()
        expect(value.length).toEqual(100)
    })
    it(`can add additional work`, async () => {
        const mapper = new ParallelMapper<number, number>(
            async (value, schedule) => {
                await delay(r(40))
                if (value % 10 == 0 && value < 100) {
                    for (let i = 1; i <= 10; i++) {
                        schedule(value + i)
                    }
                }
                return value + 100
            }
        )
        mapper.add(0)
        const value = await mapper.collect()
        expect(value.length).toEqual(101)
    })
})

function r(range: number) {
    return Math.random() * range
}