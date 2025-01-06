import { textToSpec } from "./specs"

describe("common/specs", () => {
    it("can create a default markdown spec", () => {
        const spec = textToSpec("(.*)\\.(md|markdown),$1.html")
        const t = spec("a.md")
        expect(t).toEqual("a.html")
    })
    it("can append an extension", () => {
        const spec = textToSpec("(.*)\\.(md|markdown),$0.html")
        const t = spec("a.md")
        expect(t).toEqual("a.md.html")
    })
    it("can paste multiple parts", () => {
        const spec = textToSpec("(.*)-(.*)-(.*)\\.txt,$1+$2+$3.tmp")
        const t = spec("aa-bbb-cccc.txt")
        expect(t).toEqual("aa+bbb+cccc.tmp")
    })
})