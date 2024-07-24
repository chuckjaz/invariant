import Koa from 'koa'
import { generateKeyPair as gkp } from 'node:crypto'
import * as path from 'node:path'
import { promisify } from 'node:util'
import { readFile, writeFile } from 'node:fs/promises'
import { idMiddle, idAndPrivate, IdResult } from '../../common/id'
import { text } from 'co-body'
import { normalizeCode } from '../../common/codes'
import { fileExists } from '../../common/files'
import { verifyLive } from '../../common/verify'
import { registerWithBroker } from '../../common/register'
import { delay } from '../../common/delay'

const app = new Koa()
export default app
const port = 3001

const brokerPrefix = '/broker/'
const brokerLocationPrefx = brokerPrefix + 'location/'
const brokerServersPrefix = brokerPrefix + 'servers/'
const brokerRegisterPrefix = brokerPrefix + 'register/'

const generateKeyPair = promisify(gkp)

let myId: IdResult

interface Information {
    id: string
    url: string
    kind?: string
    lastVerified: number
}

const info = new Map<string, Information>()

app.use(async function (ctx,  next) {
    console.log(ctx.method, ctx.path)
    if (ctx.path.startsWith(brokerServersPrefix) && ctx.method == 'GET') {
        const kind = trimTrailingSlash(ctx.path.slice(brokerServersPrefix.length))

        const brokers: string[] = []
        for (const entry of info.values()) {
            if (entry.kind == kind) {
                brokers.push(entry.id)
            }
        }
        if (ctx.header['accept']?.startsWith('text/plain')) {
            ctx.body = brokers.join("\n")
        } else {
            ctx.body = brokers
        }
        return
    }
    if (ctx.path == brokerRegisterPrefix && ctx.method == 'POST') {
        const infoText = await text(ctx, { limit: "1kb" })
        const entry = JSON.parse(infoText)
        if (
            'id' in entry && typeof entry.id == 'string' &&
            'url' in entry && typeof entry.url == 'string' && 
            (!('kind' in entry) || typeof entry.kind == 'string')
        ) {
            const normalId = normalizeCode(entry.id)
            if (normalId) {
                const url = sanitizeUrl(entry.url)
                if (url && await verifyLive(url, entry.id)) {
                    info.set(normalId, { id: normalId, url, kind: entry.kind, lastVerified: Date.now() })
                    save().catch(e => console.log(e))
                    ctx.body = { id: myId.id.toString('hex') }
                } else {
                    ctx.throw(400, `Url "${entry.url}" is not reachable`)
                }
                return
            }
        }
    }
    if (ctx.path.startsWith(brokerLocationPrefx) && ctx.method == 'GET') {
        const id = trimTrailingSlash(ctx.path.slice(brokerLocationPrefx.length))
        console.log('getting:', id)
        const result = info.get(id)
        console.log('result:', result)
        if (result) {
            if (ctx.header['accept']?.startsWith('text/plain')) {
                ctx.body = [`ID: ${id}`, `URL: ${result.url}`].join("\n")
            } else {
                ctx.body = {
                    id,
                    url: result.url
                }
            }
            validateId(id)
            return
        }
    }
    await next()
})

const brokerPath = path.join(__dirname, '.broker')

let saving = false
let lastSaved = Date.now()
const duration = 1000 * 5

async function save() {
    if (saving) return
    const now = Date.now()
    saving = true
    try {
        const timeTillNextSave = lastSaved + duration
        const timeToWait = timeTillNextSave - now
        if (timeToWait > 0) await delay(timeToWait)

        const data: Information[] = []
        for (const entry of info.values()) {
            data.push(entry)
        }
        const result = JSON.stringify(data)
        await writeFile(brokerPath, result, 'utf-8')
        lastSaved = Date.now()
    } finally {
        saving = false
    } 
}

async function restore() {
    if (await fileExists(brokerPath)) {
        const text = await readFile(brokerPath, 'utf8')
        const result = JSON.parse(text) as Information[]
        for (const entry of result) {
            if (!info.has(entry.id)) {
                info.set(entry.id, entry)
            }
        }
    }
}

function validateId(id: string) {
    const entry = info.get(id) as Information
    async function validate() {
        const isValid = await verifyLive(entry.url, entry.id)
        if (!isValid) {
            info.delete(id)
            save().catch(e => console.error(e))
        }
    }
    if (entry) {
        validate().catch(e => console.error(e))
    }
}

async function verifyIds() {
    // Every 5 to 10 seconds validate an id that has not been validated in the last 60 seconds 
    while (true) {
        await delay(nextInt(5000, 5000))
        const ids = Array.from(info.keys())
        const id = ids[nextInt(ids.length)]
        const entry = info.get(id)
        const now = Date.now()
        if (entry && ((entry.lastVerified ?? 0) + 60 * 1000) < now) {
            entry.lastVerified = now
            validateId(id)
        }
    }
}

function nextInt(range: number, offset?: number) {
    return Math.floor((offset ?? 0) + Math.random() * range)
}

function sanitizeUrl(urlText: string): string | undefined{
    const url = new URL(urlText)
    switch (url.protocol) {
        case 'http:':
        case 'https:':
            break
        default:
            return undefined
    }
    url.search = ""
    url.username = ""
    url.password = ""
    url.hash = ""
    return url.toString()
}

function trimTrailingSlash(path: string): string {
    const len = path.length
    if (len > 0 && path[len-1] == '/') return path.slice(0, len - 1);
    return path
}

async function startup() {
    await restore()
    myId = await idAndPrivate(__dirname, async () => {
        const result = await generateKeyPair(
            "x25519", {
                publicKeyEncoding: {
                    type: 'spki',
                    format: 'der',
                },
                privateKeyEncoding: {
                    type: 'pkcs8',
                    format: 'der',
                },
            }    
        )
        const id = Buffer.from(result.publicKey, result.publicKey.length - 32)
        const privateKey  = Buffer.from(result.privateKey, result.privateKey.length - 32)
        return { id, privateKey }
    })
    const idText = myId.id.toString('hex')
    app.use(idMiddle(idText))
    await registerWithBroker(idText, 'broker')

    // Start the verify ids loop
    verifyIds().catch(e => console.error('verifyIds', e))
    console.log("Fully started")
}

if (!module.parent) {
    app.listen(port)
    startup().catch(e => console.error(e))
    console.log(`Broker listening on localhost:${port}`)
}
