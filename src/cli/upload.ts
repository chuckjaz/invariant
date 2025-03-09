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
import { Configuration, loadConfiguration } from '../config/config';
import { defaultBroker } from './common/common_broker';
import { findStorage } from './common/common_storage';
import { error } from '../common/errors';

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
    }).option('cache', {
        alias: 'c',
        describe: "Use the sha value cache",
        boolean: true
    }),
    handler: (yargs: any) => (yargs.cache ? cachedUpload : upload)(
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
        const address = await put(storage, directoryData)
        if (!address) throw new Error(`Could not post directory ${directory}`)
        return address
    }

    const result = await readDirectory(directory)
    console.log('ROOT:', result)
}

async function cachedUpload(directory?: string, all?: boolean, storageSpec?: string, auth?: string) {
    const config = await loadConfiguration()

    // Find sha cache
    const cache = new ShaCache()
    await cache.load(config)
    if (!directory) directory = "."
    const context = new ParallelContext()
    const ig = ignore()
    const broker = await defaultBroker(config)
    const storage = await findStorage(broker, storageSpec, auth)
    if (!all) {
        ig.add('.git')
        const ignoreFile = path.join(directory, '.gitignore')
        if (await fileExists(ignoreFile)) {
            const ignoreFileText = await fs.readFile(ignoreFile, 'utf-8')
            ig.add(ignoreFileText)
        }
    }

    const directoryMap = new Map<string, Entry[]>()

    async function readDirectory(directory: string): Promise<string> {
        const entries = await fs.opendir(directory)
        let total = 0
        const tasks: (() => Promise<Entry>)[] = []

        for await (const entry of entries) {
            const fullName = path.join(directory, entry.name)
            if (entry.isFile()) {
                if (ig.ignores(fullName)) continue
                tasks.push(async () => {
                    const cacheEntry = await cache.compute(fullName)

                    const treeEntry: FileEntry = {
                        kind: EntryKind.File,
                        name: entry.name,
                        createTime: cacheEntry.ctime,
                        modifyTime: cacheEntry.mtime,
                        content: { address: cacheEntry.sha },
                        size: cacheEntry.size
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
        const directoryBytes = new TextEncoder().encode(directoryJson)
        const hasher = createHash('sha256')
        hasher.update(directoryBytes)
        const directoryHash = hasher.digest().toString('hex')
        directoryMap.set(directoryHash, treeEntries)
        return directoryHash
    }

    const uploadPromises: Promise<any>[] = []
    function a(block: () => Promise<void>) {
        uploadPromises.push(block())
    }

    async function uploadFile(sha: string, fullName: string) {
        a(async () => {
            console.log('uploading', fullName)
            const data = dataFromFile(fullName)
            const result = await storage.put(sha, data)
            if (!result) error(`Could not upload '${fullName}'`)
        })
    }

    async function uploadDirectory(sha: string, dir: string) {
        const entries = required(directoryMap.get(sha))
        for (const entry of entries) {
            const address = entry.content.address
            const has = await storage.has(address)
            if (!has) {
                const fullName = path.join(dir, entry.name)
                if (entry.kind == EntryKind.File) {
                    await uploadFile(address, fullName)
                } else {
                    await uploadDirectory(address, fullName)
                }
            }
        }

        a(async () => {
            const entriesText = JSON.stringify(entries)
            const entriesData = dataFromString(entriesText)
            console.log('Uploading', dir)
            const result = await storage.put(sha, entriesData)
            if (!result) error(`Could not write directory ${dir}`)
        })
    }

    const root = await readDirectory(directory)
    if (!await storage.has(root)) {
        await uploadDirectory(root, directory)
    }
    a(() => cache.store(config))
    await Promise.all(uploadPromises)
    console.log(`ROOT: ${root}`)
}

function required<V>(value: V | undefined): V {
    if (!value) error("Invalid state");
    return value
}

interface CacheEntry {
    mtime: number
    ctime: number
    size: number
    dev: number
    sha: string
}

interface CacheJSON {
    ino: number
    mtime: number
    ctime: number
    size: number
    dev: number
    sha: string
}

class ShaCache {
    map = new Map<number, CacheEntry>()
    changed = false

    async compute(name: string): Promise<CacheEntry> {
        const stat = await fs.stat(name)
        const mtime = Math.floor(stat.mtimeMs)
        const ctime = Math.floor(stat.ctimeMs)
        const existingEntry = this.map.get(stat.ino)
        if (existingEntry && existingEntry.dev == stat.dev && existingEntry.mtime == mtime) {
            return existingEntry
        }

        this.changed = true
        const hash = createHash('sha256')
        const buffer = await fs.readFile(name)
        hash.update(buffer)
        const sha = hash.digest().toString('hex')
        const newEntry = { mtime, ctime, size: stat.size, dev: stat.dev, sha }
        this.map.set(stat.ino, newEntry)
        return newEntry
    }

    async load(config: Configuration) {
        const cacheName = this.cacheFileName(config)
        if (await fileExists(cacheName)) {
            try {
                const content = await fs.readFile(cacheName, 'utf-8')
                const entries = JSON.parse(content) as CacheJSON[]
                for (const entry of entries) {
                    const {ino, ...cacheEntry} = entry
                    this.map.set(ino, cacheEntry)
                }
            } catch(e: any) {
                console.error(`Invalid sha cache, ignoring (${e.message}`)
            }
        }
    }

    async store(config: Configuration) {
        if (!this.changed) return
        const json: CacheJSON[] = []
        for (const [ino, entry] of this.map) {
            json.push({ ino, ...entry })
        }
        const jsonText = JSON.stringify(json, null, ' ')
        const fileName = this.cacheFileName(config)
        await fs.writeFile(fileName, jsonText)
    }

    private cacheFileName(config: Configuration): string {
        return path.join(config.configPath, 'sha-cache.json')
    }
}
