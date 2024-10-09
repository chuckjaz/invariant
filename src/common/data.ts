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