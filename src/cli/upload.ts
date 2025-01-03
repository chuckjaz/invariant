import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { createHash } from 'node:crypto'
import ignore from "ignore";
import yargs from "yargs";
import { fileExists } from "../common/files";
import { ParallelContext } from "../common/parallel_context";
import { DirectoryEntry, Entry, EntryKind, FileEntry } from '../common/types';
import { dataFromFile, dataFromString } from '../common/parseJson';
import { Data, StorageClient } from '../storage/storage_client';
import { dataFromBuffers, readAllData } from '../common/data';
import { loadConfiguration } from '../config/config';
import { defaultBroker } from './common/common_broker';
import { findStorage } from './common/common_storage';

export default {
    command: "upload [directory]",
    describe: "Upload files to a storage server",
    builder: yargs => yargs.positional('directory', {
        describe: 'The directory to upload',
        type: 'string'
    }).option('all', {
        alias: 'a',
        describe: 'Upload all files (ignoring .gitignore or other filters)',
        boolean: true
    }).option('storage', {
        alias: 's',
        describe: "The storage to use. Defaults to the first storage by the connected broker. Can be the URL or the ID of the storage",
        string: true
    }).option("auth", {
        describe: "An authentication token",
        string: true
    }),
    handler: (yargs: any) => upload(
        yargs.directory,
        yargs.all,
        yargs.storage,
        yargs.auth
    )
} as yargs.CommandModule

async function put(storage: StorageClient, data: Data): Promise<string> {
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

async function upload(directory?: string, all?: boolean, storageSpec?: string, auth?: string) {
    if (!directory) directory = "."
    const context = new ParallelContext()
    const ig = ignore()
    const configuration = await loadConfiguration()
    const broker = await defaultBroker(configuration)
    const storage = await findStorage(broker, storageSpec, auth)
    if (!all) {
        ig.add('.git')
        const ignoreFile = path.join(directory, '.gitignore')
        if (await fileExists(ignoreFile)) {
            const ignoreFileText = await fs.readFile(ignoreFile, 'utf-8')
            ig.add(ignoreFileText)
        }
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
                    const address = await put(storage, data)
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
        const address = await put(storage, directoryData)
        if (!address) throw new Error(`Could not post directory ${directory}`)
        return address
    }

    const result = await readDirectory(directory)
    console.log('ROOT:', result)
}
