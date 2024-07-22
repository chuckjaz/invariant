import Koa from 'koa'
import { join } from 'node:path'
import { readFile, writeFile } from 'node:fs/promises'
import { fileExists } from './files';
import { normalizeCode } from './codes';

type KoaCtx = Koa.ParameterizedContext<Koa.DefaultState, Koa.DefaultContext, any>;

const idPrefix = '/id/'

export interface Result {
    fn: (ctx: KoaCtx) => Promise<void>
    id?: Buffer
    privateKey?: Buffer
}

export interface GenResult {
    id: Buffer
    privateKey?: Buffer
}

export function idMiddle(directory: string, key: boolean, gen: () => Promise<GenResult>): Result  {
    const result: any = { }

    async function id(ctx: KoaCtx, next: Koa.Next) {
        await next()
        if (ctx.path == idPrefix) {
            const id = result.id
            if (!id) {
                const response = await (key ? idAndPrivate(directory, result, gen) : idOnly(directory, result, gen))
                if (!response) return
            }
            ctx.body = result.id.toString('hex')
        }
    }

    result.fn = id

    return result as any as Result
}

export async function idAndPrivate(
    directory: string, 
    result: GenResult,
    gen: () => Promise<GenResult>
): Promise<string | undefined> {
    const idFile = join(directory, '.id')
    const keyFile = join(directory, '.id.private')
    if (await fileExists(idFile) && await fileExists(keyFile)) {
        const idText = await readFile(idFile, 'utf8')
        const id = Buffer.from(idText, 'hex')
        const keyText = await readFile(keyFile, 'utf8')
        const key = Buffer.from(keyText, 'hex')
        result.id = id
        result.privateKey = key
        return id.toString('hex')
    }
    const { id: idBytes, privateKey } = await gen()
    const idText = idBytes.toString('hex')
    await writeFile(idFile, idText,  'utf8')
    const keyText = privateKey?.toString('hex') ?? '0'
    await writeFile(keyFile, keyText, 'utf8')
    result.id = idBytes
    result.privateKey = privateKey
    return idText
}

async function idOnly(
    directory: string, 
    result: GenResult,
    gen: () => Promise<GenResult>
): Promise<string | undefined> {
    const idFile = join(directory, '.id')
    if (await fileExists(idFile) ) {
        const idText = await readFile(idFile, 'utf8')
        const id = Buffer.from(idText, 'hex')
        result.id = id
        return id.toString('hex')
    }
    const { id: idBytes } = await gen()
    const idText = idBytes.toString('hex')
    await writeFile(idFile, idText,  'utf8')
    result.id = idBytes
    return idText
}

export async function fetchIdFrom(url: string): Promise<string | undefined> {
    try {
        const response = await fetch(`${url}/id/`)
        if (response.status == 200) {
            const text = await response.text()
            return normalizeCode(text)
        }
    } catch { }
}