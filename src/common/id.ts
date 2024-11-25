import { randomBytes } from 'node:crypto'
import Koa from 'koa'
import { join } from 'node:path'
import { readFile, writeFile } from 'node:fs/promises'
import { fileExists } from './files';
import { normalizeCode } from './codes';

export function randomId(): string {
    return randomBytes(32).toString('hex')
}

type KoaCtx = Koa.ParameterizedContext<Koa.DefaultState, Koa.DefaultContext, any>;

const idPrefix = '/id/'

export interface IdResult {
    id: Buffer
    privateKey?: Buffer
}

export function idMiddle(id: string): (ctx: KoaCtx, next: Koa.Next) => Promise<void> {
    async function getId(ctx: KoaCtx, next: Koa.Next) {
        await next()
        if (ctx.path == idPrefix) {
            ctx.body = id
        }
    }

    return getId
}

export async function idAndPrivate(directory: string, gen: () => Promise<IdResult>): Promise<IdResult> {
    const idFile = join(directory, '.id')
    const keyFile = join(directory, '.id.private')
    if (await fileExists(idFile) && await fileExists(keyFile)) {
        const idText = await readFile(idFile, 'utf8')
        const id = Buffer.from(idText, 'hex')
        const keyText = await readFile(keyFile, 'utf8')
        const privateKey  = Buffer.from(keyText, 'hex')
        return { id, privateKey }
    }
    const { id, privateKey } = await gen()
    const idText = id.toString('hex')
    await writeFile(idFile, idText,  'utf8')
    const keyText = privateKey?.toString('hex') ?? '0'
    await writeFile(keyFile, keyText, 'utf8')
    return  { id, privateKey }
}

export async function idOnly(directory: string, gen: () => Promise<IdResult>): Promise<IdResult> {
    const idFile = join(directory, '.id')
    if (await fileExists(idFile) ) {
        const idText = await readFile(idFile, 'utf8')
        const id = Buffer.from(idText, 'hex')
        return { id }
    }
    const { id } = await gen()
    const idText = id.toString('hex')
    await writeFile(idFile, idText,  'utf8')
    return { id }
}

export async function fetchIdFrom(url: string): Promise<string | undefined> {
    try {
        const response = await fetch(new URL('/id/', url))
        if (response.status == 200) {
            const text = await response.text()
            return normalizeCode(text)
        }
    } catch { }
}