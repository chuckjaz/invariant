import { randomId } from "../../common/id"
import { withTmpDir } from "../../common/test_tmp"
import { LocalProduction } from "./local_production"

describe('production/local', () => {
    it("can create a local production", async () => {
        await withTmpDir(async tmpDir => {
            const production = new LocalProduction(tmpDir)
            expect(production).toBeDefined()
        })
    })
    it("can record production locally", async () => {
        await withTmpDir(async tmpDir => {
            const firstProduction = new LocalProduction(tmpDir)
            const task = randomId()

            const results = arr(10, _ => [randomId(), randomId()])
            for (const [input, output] of results) {
                await firstProduction.put(task, input, output)
            }

            for (const [input, output] of results) {
                const receivedOutput = await firstProduction.get(task, input)
                expect(receivedOutput).toEqual(output)
            }

            const secondProduction = new LocalProduction(tmpDir)
            for (const [input, output] of results) {
                const receivedOutput = await secondProduction.get(task, input)
                expect(receivedOutput).toEqual(output)
            }
        })
    })
})

function arr<T>(size: number, init: (index: number) => T): T[] {
    const result: T[] = []
    for (let i = 0; i < size; i++) {
        result.push(init(i))
    }
    return result
}