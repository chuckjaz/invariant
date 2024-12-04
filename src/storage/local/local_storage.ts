import { Data, ManagedStorageClient, StorageBlock, StorageClient } from "../client";
import { opendir, mkdir, stat, rename, unlink, writeFile } from 'node:fs/promises'
import { createHash, randomBytes } from 'node:crypto'
import * as path from 'node:path'
import { dataToReadable, dataFromFile } from "../../common/parseJson";
import { createWriteStream } from 'fs'
import { pipeline } from 'node:stream/promises'
import { hashTransform } from "../../common/data";
import { normalizeCode } from "../../common/codes";

const hexBytes = /^[0-9a-fA-F]+$/

export class LocalStorage implements ManagedStorageClient {
    id: string
    directory: string

    constructor(directory: string, id?: string) {
        this.id = id ?? randomBytes(32).toString('hex')
        this.directory = directory
    }

    async ping(): Promise<string> {
        return this.id
    }

    async get(address: string): Promise<Data | false> {
        return this.sendFile(address)
    }

    async has(address: string): Promise<boolean> {
        return fileExists(this.toAddressPath(address))
    }

    async put(address: string, data: Data): Promise<boolean> {
        return await this.receiveFile(data, address) != false
    }

    async post(data: Data): Promise<string | false> {
        return this.receiveFile(data)
    }

    async fetch(): Promise<boolean> {
        return false
    }

    async forget(address: string): Promise<boolean> {
        const addressPath = this.toAddressPath(address)
        if (await fileExists(addressPath)) {
            await unlink(addressPath)
            return true
        }
        return false
    }

    async *blocks(): AsyncIterable<StorageBlock> {
        const dirPath = path.join(this.directory, 'store')
        for await (const prefix1 of directoryNames(dirPath, isPrefixByte)) {
            const layer1 = path.join(dirPath, prefix1)
            for await (const prefix2 of directoryNames(layer1, isPrefixByte)) {
                const layer2 = path.join(layer1, prefix2)
                for await (const postfix of directoryNames(layer2, isPostfixBytes)) {
                    const address = normalizeCode(path.join(layer2, postfix))
                    if (address) {
                        const fstat = await stat(address)
                        yield { address, size: fstat.size, lastAccess: fstat.atime.getTime() }
                    }
                }
            }
        }
    }

    private toAddressPath(hashCode: string): string {
        return  path.join(this.directory, 'store', hashCode.slice(0, 2), hashCode.slice(2, 4), hashCode.slice(4))
    }

    private async tmpName(): Promise<string> {
        const tmpDir = path.join(this.directory, 'tmp')
        await mkdir(tmpDir, { recursive: true })
        let disambiguation = 'a'
        let tries = 0
        while (true) {
            tries++
            if (tries > 100000) {
                disambiguation = String.fromCharCode(disambiguation.charCodeAt(0) + 1)
                tries = 0
            }
            const rand = Math.floor(Math.random() * 1000000)
            const name = path.join(tmpDir, `${disambiguation}${rand}`)
            try {
                await writeFile(name, '', { flag: 'wx' })
                return name
            } catch(e) {
                console.log('failure in tmpName', e)
            }
        }
    }

    private async receiveFile(data: Data, expected?: string): Promise<string | false> {
        if (expected) {
            const fileName = this.toAddressPath(expected)
            if (await fileExists(fileName)) return expected
        }
        const hasher = createHash('sha256')
        const name = await this.tmpName()
        const hashStream = hashTransform(data, hasher)
        const readable = dataToReadable(hashStream)
        await pipeline([readable, createWriteStream(name, { })])
        const result = hasher.digest()
        const hashCode = result.toString('hex')
        if (!expected || expected == hashCode) {
            const hashPath = this.toAddressPath(hashCode)
            if (!await fileExists(hashPath)) {
                await moveFile(name, hashPath)
            } else {
                await unlink(name)
            }
            return hashCode
        }
        return false
    }

    private async sendFile(address: string): Promise<Data | false> {
        const fileName = this.toAddressPath(address)
        if (!await fileExists(fileName)) return false
        return dataFromFile(fileName)
    }
}

async function moveFile(source: string, dest: string) {
    const dir = path.dirname(dest)
    await mkdir(dir, { recursive: true })
    await rename(source, dest)
}

async function fileExists(file: string): Promise<boolean> {
    try {
        const fstat = await stat(file)
        if (fstat.isFile()) return true
    } catch (e) {

    }
    return false
}

function isPrefixByte(name: string): boolean {
    const match = name.match(hexBytes)
    return !!match && match[0].length == 2
}

function isPostfixBytes(name: string): boolean {
    const match = name.match(hexBytes)
    return !!match && match[0].length == 28
}

async function *directoryNames(path: string, filter: (name: string) => boolean): AsyncIterable<string> {
    const dir = await opendir(path)
    for await (const entry of dir) {
        if (entry.isFile() && filter(entry.name)) {
            yield entry.name
        }
    }
}
