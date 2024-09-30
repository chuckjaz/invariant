import type { Hash } from 'node:crypto'
import { Data } from "../storage/client"

export async function *hashTransform(stream: Data, hash: Hash): Data {
    for await (const buffer of stream) {
        hash.update(buffer)
        yield buffer
    }
}
