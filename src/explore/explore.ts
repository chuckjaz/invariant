import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { LocalStorage } from '../storage/local/local_storage'
import { dataFromFile, dataFromString } from '../common/parseJson'
import { DirectoryEntry, Entry, EntryKind, FileEntry } from '../common/types'

const storage = new LocalStorage('/tmp/storage')

async function readDirectory(directory: string): Promise<string> {
    const entries = await fs.opendir(directory)
    let total = 0
    const treeEntries: Entry[] = []
    for await (const entry of entries) {
        const fullName = path.join(directory, entry.name)
        if (entry.isFile()) {
            const stat = await fs.stat(fullName)
            const data = dataFromFile(fullName)
            const address = await storage.post(data)
            if (!address) throw new Error(`Could not read ${fullName}`)
            const treeEntry: FileEntry = {
                kind: EntryKind.File,
                name: entry.name,
                createTime: Math.floor(stat.ctimeMs),
                modifyTime: Math.floor(stat.mtimeMs),
                content: { address },
                size: stat.size
            }
            treeEntries.push(treeEntry)
            continue
        }
        if (entry.isDirectory()) {
            const address = await readDirectory(fullName)
            const stat = await fs.stat(fullName)
            const treeEntry: DirectoryEntry = {
                kind: EntryKind.Directory,
                name: entry.name,
                createTime: Math.floor(stat.ctimeMs),
                modifyTime: Math.floor(stat.mtimeMs),
                content: { address },
                size: 0
            }
            treeEntries.push(treeEntry)
        }
    }
    const directoryJson = JSON.stringify(treeEntries)
    const directoryData = dataFromString(directoryJson)
    const address = await storage.post(directoryData)
    if (!address) throw new Error(`Could not post directory ${directory}`)
    return address
}

readDirectory("dist").catch(e => console.error(e)).then(s => console.log('root', s))