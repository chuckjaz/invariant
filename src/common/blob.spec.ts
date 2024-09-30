import { Blob } from 'node:buffer'
import { streamBlob } from './blob'

describe("common/blob", () => {
    it("can stream a single block", async () => {
        const content = repeatedString("This is a test.\n", 1000)
        const contentBinary = new TextEncoder().encode(content)
        const blob = new Blob([contentBinary])
        let buffer = Buffer.from("")
        for await (const item of await streamBlob(blob)) {
            buffer = Buffer.concat([buffer, item])
        }
        const result = new TextDecoder().decode(buffer)
        expect(result).toEqual(content)
    })
    it("can stream multiple blocks", async () => {
        const content = repeatedString("This is a test.\n", 10000)
        const contentSplit = content.split("\n")
        const contentBinary = contentSplit.map(text => text != "" ? new TextEncoder().encode(text + "\n") : "")
        const blob = new Blob(contentBinary)
        let buffer = Buffer.from("")
        for await (const item of await streamBlob(blob)) {
            buffer = Buffer.concat([buffer, item])
        }
        const result = new TextDecoder().decode(buffer)
        expect(result).toEqual(content)

    })
})

function repeatedString(value: string, count: number): string {
    if (count == 0) return ""
    let first = count % 1 == 0 ? "" : value
    const half = count >> 1
    const halfString = repeatedString(value, half)
    return first + halfString + halfString
}
