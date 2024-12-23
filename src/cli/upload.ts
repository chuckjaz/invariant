import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { createHash } from 'node:crypto'
import ignore from "ignore";
import yargs from "yargs";
import { fileExists } from "../common/files";
import { ParallelContext } from "../common/parallel_context";
import { DirectoryEntry, Entry, EntryKind, FileEntry } from '../common/types';
import { dataFromFile, dataFromString } from '../common/parseJson';
import { Data, StorageClient } from '../storage/client';
import { dataFromBuffers, readAllData } from '../common/data';
import { normalizeCode } from '../common/codes';
import { error } from '../common/errors';
import { loadConfiguration } from '../config/config';
import { BrokerClient } from '../broker/broker_client';
import { BrokerWebClient } from '../broker/web/broker_web_client';
import { StorageWebClient } from '../storage/web/storage_web_client';

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
    handler: yargs => upload(
        (yargs as any).directory,
        (yargs as any).all,
        (yargs as any).storage,
        (yargs as any).auth
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

async function findStorage(
    storageSpec: string | undefined,
    auth: string | undefined
): Promise<StorageClient> {
    const id = normalizeCode(storageSpec)
    if (storageSpec && !id) {
        let url: URL
        try {
            url = new URL(storageSpec)
        } catch (e) {
            error(`'${storageSpec}' should be a valid URL or a valid storage ID`)
        }
        return new StorageWebClient(url, undefined, auth ? (_, init) => {
            if (init?.method == 'PUT') {
                init.headers = [["X-Custom-Auth-Key", auth]]
            }
            return init
        } : undefined)
    }
    const configuration = await loadConfiguration()
    let brokerClient: BrokerClient
    if (configuration.broker) {
        brokerClient = new BrokerWebClient(configuration.broker)
    } else {
        error("Invariant is not connected")
    }
    let storageClient: StorageClient | undefined
    if (id) {
        storageClient = await brokerClient.storage(id)
    } else {
        for await (const id of await brokerClient.registered('storage')) {
            storageClient = await brokerClient.storage(id)
            if (storageClient && await storageClient.ping() !== undefined) break
        }
    }
    if (!storageClient) error(`Could not find storage ${id}`);
    return storageClient
}

async function upload(directory?: string, all?: boolean, storageSpec?: string, auth?: string) {
    if (!directory) directory = "."
    const context = new ParallelContext()
    const ig = ignore()
    const storage = await findStorage(storageSpec, auth)
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
