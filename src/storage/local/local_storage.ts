import { Data, StorageClient } from "../client";
import { mkdir, stat, rename, unlink, writeFile } from 'node:fs/promises'
import { createHash, randomBytes } from 'node:crypto'
import * as path from 'node:path'
import { dataToReadable, dataFromFile } from "../../common/parseJson";
import { createWriteStream } from 'fs'
import { pipeline } from 'node:stream/promises'
import { hashTransform } from "../../common/data";

export class LocalStorage implements StorageClient {
    id: string
    directory: string

    constructor(directory: string) {
        this.id = randomBytes(32).toString('hex')
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

    async put(addrss: string, data: Data): Promise<boolean> {
        return await this.receiveFile(data, addrss) != false
    }

    async post(data: Data): Promise<string | false> {
        return this.receiveFile(data)
    }

    async fetch(code: string, container?: string): Promise<boolean> {
        return false
    }

    private toAddressPath(hashCode: string): string {
        return  path.join(this.directory, 'sha256', hashCode.slice(0, 2), hashCode.slice(2, 4), hashCode.slice(4))
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
