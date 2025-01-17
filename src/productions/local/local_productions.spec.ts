import { arr } from "../../common/arr"
import { randomId } from "../../common/id"
import { withTmpDir } from "../../common/test_tmp"
import { LocalProductions } from "./local_productions"

describe('production/local', () => {
    it("can create a local production", async () => {
        await withTmpDir(async tmpDir => {
            const production = new LocalProductions(tmpDir)
            expect(production).toBeDefined()
        })
    })
    it("can record production locally", async () => {
        await withTmpDir(async tmpDir => {
            const firstProduction = new LocalProductions(tmpDir)
            const task = randomId()

            const results = arr(10, _ => [randomId(), randomId()])
            for (const [input, output] of results) {
                await firstProduction.put(task, input, output)
            }

            for (const [input, output] of results) {
                const receivedOutput = await firstProduction.get(task, input)
                expect(receivedOutput).toEqual(output)
            }

            const secondProduction = new LocalProductions(tmpDir)
            for (const [input, output] of results) {
                const receivedOutput = await secondProduction.get(task, input)
                expect(receivedOutput).toEqual(output)
            }
        })
    })
})
