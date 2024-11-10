import { jsonBackwardStream, jsonStream, jsonStreamToText, safeParseJson, textStreamFromFile, textStreamFromFileBackward, textStreamFromWeb } from "./parseJson"
import { ReadableStreamDefaultReader } from "node:stream/web"
import { withTempFile } from "./test_tmp"

describe("common/parseJson", () => {
    function stringToReader(text: string, len: number): ReadableStreamDefaultReader {
        const data: ArrayBufferLike[] = []
        for (let i = 0, l = text.length; i < l; i += len) {
            data.push(new TextEncoder().encode( text.slice(i, i + len)))
        }
        const dataLen = data.length
        let index = 0
        let resolved: (v: undefined) => void
        let closed = new Promise<undefined>((res, _) => resolved = res)
        const result: ReadableStreamDefaultReader = {
            read: async function (): Promise<any> {
                if (index < dataLen) {
                    return { value: data[index++], done: false }
                } else {
                    resolved(undefined)
                    return { done: true }
                }
            },
            releaseLock: function (): void {
                index = 0
            },
            closed,
            cancel: async function (reason?: any): Promise<void> { index = dataLen }
        }
        return result
    }

    async function concatAsyncStrings(stream: AsyncIterable<string>): Promise<string> {
        let result  = ""
        for await (const item of stream) {
            result += item
        }
        return result
    }

    describe("parseJson", () => {
        it("can parse JSON", () => {
            const data = {
                a: "1",
                b: "2",
                c: [ 1, 2, 3]
            }
            const encoded = JSON.stringify(data)
            const decoded = safeParseJson(encoded)
            expect(decoded).toEqual(data)
        })
        it("returns undefined on invalid JSON", () => {
            const result = safeParseJson("{ a: b }")
            expect(result).toBeUndefined()
        })
    })
    describe("textStreamFromWeb", () => {
        it("can split and join a string", async () => {
            const data = "This is a test string. "
            const reader = stringToReader(data, 2)
            const stream = await textStreamFromWeb(reader)
            const result = await concatAsyncStrings(stream)
            expect(result).toEqual(data)
        })
        it("can read from google.com", async () => {
            const stream = await textStreamFromWeb(new URL("https://google.com"))
            const result = await concatAsyncStrings(stream)
            expect(result).withContext("reading").toBeDefined()
        })
    })
    describe("textStreamFromFile", () => {
        it("can read a file", async () => {
            const a: string[] = []
            for (let i = 0; i < 10000; i++) {
                a[i] = "This is a test file."
            }
            const data = a.join('\n')
            await withTempFile(data, async tmpFileName => {
                const read = await concatAsyncStrings(await textStreamFromFile(tmpFileName))
                expect(read).toEqual(data)
            })
        })
    })
    describe("jsonStream", () => {
        it("can parse a single json object", async () => {
            const data = { a: "b", c: "d"}
            const text = JSON.stringify(data)
            const reader = stringToReader(text, 2)
            let count = 0
            for await (const item of await jsonStream(await textStreamFromWeb(reader))) {
                expect(item).toEqual(data)
                count++
            }
            expect(count).toEqual(1)
        })
        it("can parse multiple json objects", async () => {
            const data = { a: "b", c: "d"}
            const text = JSON.stringify(data)
            const reader = stringToReader(text + text + text + text + text, 2)
            let count = 0
            for await (const item of await jsonStream(await textStreamFromWeb(reader))) {
                expect(item).toEqual(data)
                count++
            }
            expect(count).toEqual(5)
        })
        it("can stream strings", async () => {
            const strings = stream<string>(30, i => `Item ${i}`)
            const textStream = jsonStreamToText(strings)
            const dataStream = await jsonStream<string>(textStream)
            let i = 0
            for await (const item of dataStream) {
                expect(item).toEqual(`Item ${i++}`)
            }
        })
    })
    describe("textStreamFromFileBackward", () => {
        it("can a file backwards", async () => {
            let data = ""
            for (let i = 0; i < 10000; i++) {
                data += `${i}: This is a test file.\n`
            }

            await withTempFile(data, async tmpFileName => {
                const stream = await textStreamFromFileBackward(tmpFileName)
                let received = ""
                for await (const text of stream) {
                    received += [...text].reverse().join("")
                }
                const backwardsData = [...data].reverse().join("")
                expect(received).toEqual(backwardsData)
            })
        })
    })
    describe("jsonBackwardStream", () => {
        it("can read a single object", async () => {
            let data: any = {"a": "b", "c": "d"}
            const content = JSON.stringify(data)
            await withTempFile(content, async withTmpFile => {
                const stream = await textStreamFromFileBackward(withTmpFile)
                const jsonStream = await jsonBackwardStream(stream)
                let count = 0
                for await (const item of jsonStream) {
                    expect(item).toEqual(data)
                    count++
                }
                expect(count).toEqual(1)
            })
        })
        it("can read large number of objects", async () => {
            const size = 10000
            const data: any[] = []
            const baseData = {
                a: 12,
                b: [1, 2, 3, 4],
                c: { a: 1, b: 2 }
            }
            for (let i = 0; i < size; i++) {
                data.push({n: i, ...baseData})
            }
            const content = JSON.stringify(data)
            await withTempFile(content, async withTmpFile => {
                const stream = await textStreamFromFileBackward(withTmpFile)
                const jsonStream = await jsonBackwardStream(stream)
                let expected = size - 1
                let count = 0
                for await (const item of jsonStream) {
                    expect(item).toEqual({ n: expected--, ...baseData })
                    count++
                }
                expect(count).toEqual(size)
            })
        })
    })
    describe("jsonStreamToText", () => {
        it("can stream objects", async () => {
            const objects = stream(30, i => ({ a: i, b: i * 2 }))
            let i = 0
            for await (const item of jsonStreamToText(objects)) {
                let n = i++
                expect(item).toEqual(`{"a":${n},"b":${n*2}}`)
            }
        })
    })
})

async function *stream<T>(size: number, init: (index: number) => T): AsyncIterable<T> {
    for (let i = 0; i < size; i++) {
        yield init(i)
    }
}

