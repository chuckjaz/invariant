import type { Hash } from 'node:crypto'
import { Data } from "../storage/client"
import { Readable, Transform } from "node:stream"
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as crypto from 'node:crypto'
import { Channel } from './channel'
import { z } from 'zod'
import { dataToString, safeParseJson } from './parseJson'

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

export async function *dataFromReadable(readable: Readable): Data {
    const channel = new Channel<Buffer>(100)
    async function readAll() {
        readable.pause()
        readable.on('data', data => channel.send(data))
        readable.on('error', err => channel.fail(err))
        readable.on('close', () => channel.close())
        readable.resume()
    }
    readAll()
    yield *channel.all()
}

export async function *readDataFromFile(fullName: string): Data {
    const fh = await fs.open(fullName, "r")
    try {
        while (true) {
            const result = await fh.read()
            if (result.bytesRead > 0) yield result.buffer
        }
    } finally {
        fh.close()
    }
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

export async function jsonFromData<Schema extends z.ZodType<any, any, any>, T = z.output<Schema>>(
    schema: Schema,
    data: Data,
): Promise<T | undefined> {
    const text = await dataToString(data)
    const jsonObject = safeParseJson(text)
    if (jsonObject && schema.safeParse(jsonObject)) {
        return jsonObject
    }
    return undefined
}

export function splitStream<T>(data: AsyncIterable<T>): [AsyncIterable<T>, AsyncIterable<T>] {
    const channel1 = new Channel<T>()
    const channel2 = new Channel<T>()

    async function readAll() {
        try {
            for await (const item of data) {
                if (channel1.closed && channel2.closed) break
                channel1.send(item)
                channel2.send(item)
            }
        } finally {
            channel1.close()
            channel2.close()
        }
    }

    readAll()

    return [channel1.all(), channel2.all()]
}

async function *moveCipherData<T extends crypto.Decipher | crypto.Cipher>(transform: T, data: Data): Data {
    for await (const buffer of data) {
        yield transform.update(buffer)
    }
    const final = transform.final()
    if (final.length > 0) yield final
}

export async function *decipherData(algorithm: string, key: string, iv: string, data: Data): Data {
    const keyBuffer = Buffer.from(key, 'hex')
    const ivBuffer = Buffer.from(iv, 'hex')
    const decipher = crypto.createDecipheriv(algorithm, keyBuffer, ivBuffer)
    yield *moveCipherData(decipher, data)
}

export async function *cipherData(algorithm: string, key: string, iv: string, data: Data): Data {
    const keyBuffer = Buffer.from(key, 'hex')
    const ivBuffer = Buffer.from(iv, 'hex')
    const cipher = crypto.createCipheriv(algorithm, keyBuffer, ivBuffer)
    yield *moveCipherData(cipher, data)
}
