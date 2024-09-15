import { Channel } from "./channel"
import { ReadableStreamDefaultReader, ReadableStream } from "node:stream/web"
import { Readable } from 'node:stream'
import * as fss from 'node:fs'
import * as fs from 'node:fs/promises'

export function safeParseJson(text: string, reviver?: (this: any, key: string, value: any) => any): any | undefined {
    try {
        return JSON.parse(text, reviver)
    } catch {
        return undefined
    }
}

export async function textStreamFromFile(file: string | fss.ReadStream): Promise<AsyncIterable<string>> {
    const stream = typeof file == "string" ? fss.createReadStream(file, 'utf-8') : file
    stream.pause()
    const channel = new Channel<string>()
    stream.on('data', data => channel.send(data as string))
    stream.on('close', () => channel.close())
    stream.on('end', () => channel.close())
    stream.on('error', e => channel.fail(e))
    stream.resume()
    return channel.all()
}

export function textToStream(stream: AsyncIterable<string>): Readable {
    const readable = new Readable()
    async function readAll() {
        for await (const text of stream) {
            if (readable.closed) return
            readable.push(text)
        }
        readable.push(null)
    }
    readAll()
    return readable
}

export async function textStreamFromFileBackward(file: string): Promise<AsyncIterable<string>> {
    const fileHandle = await fs.open(file, 'r')
    const stat = await fs.lstat(file)
    const size = stat.size
    const naturalBlockSize = stat.blksize
    const buffer = Buffer.alloc(naturalBlockSize)
    let retained: Buffer | undefined = undefined
    let readSize = size % naturalBlockSize
    let current = size - readSize
    let channel = new Channel<string>(2)
    async function readAll() {
        try {
            while (current >= 0) {
                if (channel.closed) break
                const result = await fileHandle.read(buffer, 0, readSize, current)
                if (result.bytesRead != readSize) throw new Error("Unexpected read result");
                // Avoid splitting a utf-8 encoding by advancing to the first non-continuation byte
                let offset = 0
                while (offset < readSize && (buffer.at(offset)!! & 0xC0) == 0x80) {
                    offset++
                }
                let read = buffer.subarray(offset, readSize)
                if (retained) read = Buffer.concat([retained, read]);
                if (offset > 0) {
                    retained = buffer.subarray(0, offset)
                } else {
                    retained = undefined
                }
                const text = new TextDecoder().decode(read)
                channel.send(text)
                current -= naturalBlockSize
                readSize = naturalBlockSize
            }
        } finally {
            fileHandle.close()
            channel.close()
        }
    }
    readAll().catch(e => channel.fail(e))
    return channel.all()
}

export async function textStreamFromWeb(urlOrStream: URL | ReadableStreamDefaultReader): Promise<AsyncIterable<string>> {
    let stream: ReadableStreamDefaultReader<any>
    if ('host' in urlOrStream) {
        const response = await fetch(urlOrStream)
        if (!response.ok) throw new Error(`Unable to fetch stream: ${response.status}`);
        if (!response.body) throw new Error("Expected a body to be returned by fetch")
        stream = response.body.getReader()
    } else {
        stream = urlOrStream
    }
    const channel = new Channel<string>()
    async function readAll(reader: ReadableStreamDefaultReader) {
        while (true) {
            const { done, value } = await reader.read()
            if (channel.closed) return
            if (done) {
                channel.close()
                return
            }
            const text = new TextDecoder().decode(value)
            channel.send(text)
        }
    }
    readAll(stream).catch(e => channel.fail(e))
    return channel.all()
}

export async function *jsonStreamToText<T>(stream: AsyncIterable<T>): AsyncIterable<string> {
    for await (const item of stream) {
        yield JSON.stringify(item)
    }
}

export async function jsonStream<T>(
    dataOrUrl: URL | AsyncIterable<string>,
    options?: {
        limit?: number
    }
): Promise<AsyncIterable<T>> {
    let data: AsyncIterable<string>
    if ('host' in dataOrUrl) {
        data = await textStreamFromWeb(dataOrUrl)
    } else {
        data = dataOrUrl
    }
    const limit = options?.limit ?? Infinity
    async function* readAll(): AsyncIterable<T> {
        let buffer = ""
        let braceNesting = 0
        let inDoubleString = false
        let inSingleString = false
        let inString = false
        let arrayNested = 0
        let i = 0
        let start = 0
        for await (const text of data) {
            buffer += text
            if (buffer.length > limit) throw Error(`Exceeded buffer limit of ${limit}`);
            let len = buffer.length
            while (i < len) {
                let c = buffer[i++]
                switch (c) {
                    case '{': {
                        if (!inString) {
                            if (braceNesting == 0) start = i - 1;
                            braceNesting++;
                            break
                        }
                        break
                    }
                    case '}': {
                        if (!inString) {
                            braceNesting--
                            if (braceNesting == 0 && arrayNested == 0) {
                                const jsonText = buffer.slice(start, i)
                                yield JSON.parse(jsonText)
                                buffer = buffer.slice(i)
                                i = 0
                                len = buffer.length
                            }
                        }
                        break
                    }
                    case '"': {
                        if (!inString) {
                            inString = true
                            inDoubleString = true
                        } else if (inDoubleString) {
                            inString = false
                            inDoubleString = false
                        }
                        break
                    }
                    case "'": {
                        if (!inString) {
                            inString = true
                            inSingleString = true
                        } else if (inSingleString) {
                            inString = false
                            inSingleString = false
                        }
                        break
                    }
                    case "\\": i++; break
                    case "[": {
                        if (braceNesting == 0) {
                            buffer = buffer.slice(i)
                            len = buffer.length
                            i = 0
                            break
                        }
                        if (!inString) arrayNested++;
                        break
                    }
                    case "]": if (!inString) arrayNested--; break
                }
            }
        }
    }
    return readAll()
}

export async function jsonBackwardStream<T>(
    data: AsyncIterable<string>,
    options?: {
        limit?: number
    }
): Promise<AsyncIterable<T>> {
    const limit = options?.limit ?? Infinity
    async function* readAll(): AsyncIterable<T> {
        let buffer = ""
        let braceNesting = 0
        let inDoubleString = false
        let inSingleString = false
        let inString = false
        let arrayNested = 0
        let i = 0
        let end = 0
        loop: for await (const text of data) {
            if (text.length == 0) continue
            if (buffer.length + text.length > limit) throw Error(`Exceeded buffer limit of ${limit}`);
            buffer = text + buffer
            i += text.length
            end += text.length
            while (i > 0) {
                let c = buffer[--i]
                switch (c) {
                    case '}': {
                        if (!inString) {
                            if (braceNesting == 0) end = i + 1;
                            braceNesting++;
                            break
                        }
                        break
                    }
                    case '{': {
                        if (!inString) {
                            braceNesting--
                            if (braceNesting == 0 && arrayNested == 0) {
                                const jsonText = buffer.slice(i, end)
                                yield JSON.parse(jsonText)
                                buffer = buffer.slice(0, i)
                            }
                        }
                        break
                    }
                    case '"': {
                        if (i <= 0) {
                            i++
                            continue loop
                        }
                        if (buffer[i - 1] == '\\') continue
                        if (buffer)
                        if (!inString) {
                            inString = true
                            inDoubleString = true
                        } else if (inDoubleString) {
                            inString = false
                            inDoubleString = false
                        }
                        break
                    }
                    case "'": {
                        if (i <= 0) {
                            i++
                            continue loop
                        }
                        if (buffer[i - 1] == '\\') continue
                        if (!inString) {
                            inString = true
                            inSingleString = true
                        } else if (inSingleString) {
                            inString = false
                            inSingleString = false
                        }
                        break
                    }
                    case "]": {
                        if (!inString && braceNesting > 0) arrayNested++;
                        break
                    }
                    case "[": if (!inString && braceNesting > 0) arrayNested--; break
                }
            }
        }
    }
    return readAll()
}