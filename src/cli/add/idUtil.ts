import fs from 'node:fs/promises'
import path from 'node:path'
import { directoryExists, fileExists } from '../../common/files'
import { randomId } from '../../common/id'
import { normalizeCode } from '../../common/codes'

export async function determineId(id?: string, directory?: string): Promise<string> {
    let writeIdFile = directory && await directoryExists(directory)
    if (!id && directory) {
        // See if there is an existing id file in the directory
        const idFile = path.join(directory, '.id')
        if (await fileExists(idFile)) {
            writeIdFile = false
            const storedId = await fs.readFile(idFile, 'utf-8')
            const normalizedId = normalizeCode(storedId)
            if (storedId && !normalizedId) {
                console.warn(`Ignoring invalid id in ${idFile}`)
            } else {
                id = normalizedId
            }
        }
    }

    if (!id) {
        id = randomId()
    }

    if (writeIdFile && directory) {
        const idFile = path.join(directory, '.id')
        await fs.writeFile(idFile, id, 'utf-8')
    }

    return id
}