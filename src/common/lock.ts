import * as fs from 'node:fs/promises'
import { randomInt } from 'node:crypto'
import { delay } from './delay'

export async function lock<R>(fileName: string, block: () => Promise<R>): Promise<R> {
    let handle: fs.FileHandle | undefined
    let backoff = 2
    let tries = 0
    while (tries < 10) {
        tries++
        try {
            handle = await fs.open(fileName, "wx")
        } catch(e: any) {
            handle = undefined
            if (e.code == 'EEXIST') {
                await delay(backoff)
                if (backoff < 750) {
                    backoff += 1 + randomInt(backoff)
                }
                continue
            } else {
                throw e
            }
        }
        break
    }
    if (!handle) throw new Error(`Could not aquire lock file: ${fileName}`);
    try {
        return await block()
    } finally {
        await handle.close()
        await fs.rm(fileName)
    }
}
