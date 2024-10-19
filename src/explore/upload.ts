import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { createHash } from 'node:crypto'
import { dataFromFile, dataFromString } from '../common/parseJson'
import { Storage } from '../storage/web/storage_web_client'
import { Data } from '../storage/client'
import { dataFromBuffers, readAllData } from '../common/data'
import { ParallelContext } from '../common/parallel_context'
import ignore from 'ignore'
import { fileExists } from '../common/files'
import { DirectoryEntry, Entry, EntryKind, FileEntry } from '../common/types'

const storage = new Storage(
    new URL("http://localhost:3001"),
    undefined,
    (_, init) => {
        if (init?.method == 'PUT') {
            init.headers = [["X-Custom-Auth-Key", process.env.STORAGE_AUTH as string]]
        }
        return init
    }
)

async function put(data: Data): Promise<string> {
    const hasher = createHash('sha256')
    const buffer = await readAllData(data)
    hasher.update(buffer)
    const digest = hasher.digest()
    const code = digest.toString('hex')
    if (await storage.has(code)) {
        return code
    }
    const result = await storage.put(code, dataFromBuffers([buffer]))
    if (!result) throw new Error('Could not upload data')
    return code
}

async function upload(directory: string) {
    const context = new ParallelContext()
    const ig = ignore().add('.git')
    const ignoreFile = path.join(directory, '.gitignore')
    if (await fileExists(ignoreFile)) {
        const ingoreFileText = await fs.readFile(ignoreFile, 'utf-8')
        ig.add(ingoreFileText)
    }
    async function readDirectory(directory: string): Promise<string> {
        const entries = await fs.opendir(directory)
        let total = 0
        const tasks: (() => Promise<Entry>)[] = []

        for await (const entry of entries) {
            const fullName = path.join(directory, entry.name)
            if (entry.isFile()) {
                if (ig.ignores(fullName)) continue
                tasks.push(async () => {
                    const stat = await fs.stat(fullName)
                    const data = dataFromFile(fullName)
                    console.log('uploading', fullName)
                    const address = await put(data)
                    if (!address) throw new Error(`Could not read ${fullName}`)
                    const treeEntry: FileEntry = {
                        kind: EntryKind.File,
                        name: entry.name,
                        createTime: Math.floor(stat.ctimeMs),
                        modifyTime: Math.floor(stat.mtimeMs),
                        content: { address },
                        size: stat.size
                    }
                    return treeEntry
                })
                continue
            }
            if (entry.isDirectory()) {
                if (ig.ignores(fullName + '/')) continue
                tasks.push(async () => {
                    const address = await readDirectory(fullName)
                    const stat = await fs.stat(fullName)
                    const treeEntry: DirectoryEntry = {
                        kind: EntryKind.Directory,
                        name: entry.name,
                        createTime: Math.floor(stat.ctimeMs),
                        modifyTime: Math.floor(stat.mtimeMs),
                        content: { address }
                    }
                    return treeEntry
                })
            }
        }
        const treeEntries = await context.map(tasks, async task => await task())
        treeEntries.sort((a, b) => a.name > b.name ? 1 : a.name < b.name ? -1 : 0)
        const directoryJson = JSON.stringify(treeEntries)
        const directoryData = dataFromString(directoryJson)
        console.log(`uploading ${directory}/`)
        const address = await put(directoryData)
        if (!address) throw new Error(`Could not post directory ${directory}`)
        return address
    }

    return await readDirectory(directory)
}

upload(".").catch(e => {
    console.error(e)
    process.exit(1)
}).then(code => console.log("root", code))