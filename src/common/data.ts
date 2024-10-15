import type { Hash } from 'node:crypto'
import { Data } from "../storage/client"
import * as fs from 'node:fs/promises'
import * as path from 'node:path'

export async function *hashTransform(stream: Data, hash: Hash): Data {
    for await (const buffer of stream) {
        hash.update(buffer)
        yield buffer
    }
}

export async function readAllData(data: Data): Promise<Buffer> {
    let result: Buffer[] = []
    for await (const buffer of data) {
        result.push(buffer)
    }
    return Buffer.concat(result)
}

export async function *dataFromBuffers(buffers: Buffer[]): Data {
    yield *buffers.filter(buffer => buffer.length > 0)
}

export async function writeDataToFile(data: Data, fullName: string) {
    const directory = path.dirname(fullName)
    await fs.mkdir(directory, { recursive: true })
    const fh = await fs.open(fullName, "wx")
    try {
        for await (const buffer of data) {
            await fh.write(buffer)
        }
    } finally {
        await fh.close()
    }
}

export async function *dataToStrings(data: Data): AsyncIterable<string> {
    let prefix: Buffer | undefined = undefined
    for await (const buffer of data) {
        const len = buffer.length
        if (len == 0) continue
        const lastByte = buffer.at(len - 1)!!
        if (isUtf8TrailByte(lastByte)) {
            if (!prefix) prefix = buffer
            else prefix = Buffer.concat([prefix, buffer])
        } else {
            let textBuffer = buffer
            if (prefix) textBuffer = Buffer.concat([prefix, textBuffer]);
            const text = new TextDecoder().decode(textBuffer)
            yield text
        }
    }
}

export async function *stringsToData(strings: string | Iterable<string> | AsyncIterable<string>): Data {
    if (typeof strings == 'string') {
        yield Buffer.from(new TextEncoder().encode(strings))
        return
    }
    if (Symbol.iterator in strings) {
        for (const item of strings) {
            yield Buffer.from(new TextEncoder().encode(item))
        }
    } else {
        for await (const item of strings) {
            yield Buffer.from(new TextEncoder().encode(item))
        }
    }
}

function isUtf8TrailByte(byte: number): boolean {
    return (0xD0 & byte) == 0x80
}

export function take<T>(itr: Iterable<T>, size: number): T[] {
    const result: T[] = []
    if (size > 0) {
        for (const item of itr) {
            result.push(item)
            if (result.length >= size) break
        }
    }
    return result
}