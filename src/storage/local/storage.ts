import Koa from 'koa';
import { createReadStream, createWriteStream } from 'fs'
import { Transform } from 'node:stream'
import { createHash, Hash, randomBytes } from 'node:crypto'
import { stat, mkdir, rename, unlink, writeFile, readFile } from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'
import * as path from 'node:path'
import { idMiddle, idOnly } from '../../common/id';
import { registerWithBroker } from '../../common/register';

const app = new Koa()
export default app
const port = 3000

const sha256Prefix = '/storage/sha256/'

app.use(async function (ctx,  next) {
    console.log(ctx.method, ctx.path)
    try {
        if (ctx.path.startsWith(sha256Prefix)) {
            if (ctx.path === sha256Prefix) {
                if (ctx.method == 'POST') {
                    await receiveFile(ctx)
                    return
                }
            } else {
                const hashPart = ctx.path.slice(sha256Prefix.length)
                const hashCode = normalizeCode(hashPart)
                if (hashCode !== undefined) {
                    try {
                        const hashPath = toHashPath(hashCode)
                        switch (ctx.method) {
                            case 'GET':
                                if (await fileExists(hashPath)) {
                                    ctx.response.type = 'application/octet-stream'
                                    ctx.body = createReadStream(hashPath, { })
                                    ctx.etag = hashCode
                                    ctx.set('cache-control', 'immutable')
                                    return
                                }
                                break
                            case 'HEAD': {
                                const size = await fileSize(hashPath)
                                if (size !== undefined) {
                                    ctx.response.status = 200
                                    ctx.response.type = 'application/octet-stream'
                                    ctx.response.length = size
                                    ctx.response.etag = hashCode
                                    return
                                }
                                break
                            }
                            case 'PUT':
                                if (await receiveFile(ctx, receivedCode => receivedCode == hashCode)) {
                                    return
                                }
                                break
                        }
                    } catch(e) { console.error((e as any).message) }
                }
            }
        }
        await next()
    } catch { }
})

function normalizeCode(hexBytes: string): string | undefined {
    if (hexBytes.length == 32 * 2) {
        try {
            const hashBytes = Buffer.from(hexBytes, 'hex')
            return hashBytes.toString('hex')
        } catch { }
    }
    return undefined
}

async function receiveFile(
    ctx: Koa.ParameterizedContext<Koa.DefaultContext, Koa.DefaultState, any>,
    validate: (hashCode: string) => boolean = () => true
) {
    try {
        const hasher = createHash('sha256')
        const hx = hashTransform(hasher)
        const name = await tmpName()
        await pipeline([ctx.request.req, hx, createWriteStream(name, { })])
        const result = hasher.digest()
        const hashCode = result.toString('hex')
        if (validate(hashCode)) {
            ctx.body = `${sha256Prefix}${hashCode}`
            const hashPath = toHashPath(hashCode)
            if (!await fileExists(hashPath)) {
                await moveFile(name, hashPath)
            } else {
                await unlink(name)
            }
            return true
        }
    } catch { }
    return false
}

async function moveFile(source: string, dest: string) {
    const dir = path.dirname(dest)
    await mkdir(dir, { recursive: true})
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

async function fileSize(file: string): Promise<number | undefined> {
    try {
        const fstat = await stat(file);
        return fstat.size
    } catch {
        return undefined
    }
}

function toHashPath(hashCode: string): string {
    return  path.join(__dirname, 'sha256', hashCode.slice(0, 2), hashCode.slice(2, 4), hashCode.slice(4))
}

async function tmpName(): Promise<string> {
    const tmpDir = path.join(__dirname, 'tmp')
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

        }
    }
}

const limit = 1024 * 1024

function hashTransform(hasher: Hash) {
    let size = 0
    return new Transform({
        transform(chunk, encoding, callback) {
            size += chunk.length
            if (size > limit) {
                callback(Error("Limit exceeded"))
                return
            }
            this.push(chunk)
            hasher.update(chunk)
            callback()
        }
    })
}

async function startup() {
    const myId = await idOnly(__dirname, async () => ({ id: randomBytes(32) }))
    const idText = myId.id.toString('hex')
    app.use(idMiddle(idText))

    await registerWithBroker(idText, 'storage')
    console.log(`Storage: ${idText} listening on localhost:${port}}`)
}

if (!module.parent) {
    app.listen(port)
    startup().catch(e => console.error(e))
}
