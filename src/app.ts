import Koa from 'koa';
import { createReadStream, createWriteStream, WriteStream } from 'fs'
import { Transform } from 'node:stream'
import { createHash, Hash } from 'node:crypto'
import { stat, mkdir, rename, unlink, writeFile } from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'
import * as path from 'node:path'

const app = new Koa()
export default app

const sha256Prefix = '/blob/sha256/'

app.use(async function (ctx) {
    if (ctx.path.startsWith(sha256Prefix)) {
        if (ctx.path === sha256Prefix) {
            if (ctx.method == 'POST') {
                await receiveFile(ctx)
                return
            }
        } else {
            const hashPart = ctx.path.slice(sha256Prefix.length)
            if (hashPart.length == 32 * 2) {
                try {
                    const hashBuffer = Buffer.from(hashPart, 'hex')
                    // Normalize the string
                    const hashCode = hashBuffer.toString('hex')
                    const hashPath = toHashPath(hashCode)
                    switch (ctx.method) {
                        case 'GET':
                            if (await fileExists(hashPath)) {
                                ctx.body = createReadStream(hashPath, { })
                                return
                            }
                            break
                        case 'HEAD':
                            if (await fileExists(hashPart)) {
                                ctx.body = ''
                                return
                            }
                            break
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
})

async function receiveFile(
    ctx: Koa.ParameterizedContext<Koa.DefaultContext, Koa.DefaultState, any>,
    validate: (hashCode: string) => boolean = () => true 
) {
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

function toHashPath(hashCode: string): string {
    return  path.join(__dirname, 'sha256', hashCode.slice(0, 2), hashCode.slice(2, 4), hashCode.slice(5))
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


function hashTransform(hasher: Hash) {
    return new Transform({
        transform(chunk, encoding, callback) {
            this.push(chunk)
            hasher.update(chunk)
            callback()
        }        
    })
}

if (!module.parent) {
    app.listen(3000)
    console.log("Listening on localhost:3000")
}
