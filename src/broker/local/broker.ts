import Koa from 'koa'
import { generateKeyPair as gkp } from 'node:crypto'
import * as path from 'node:path'
import { promisify } from 'node:util'
import { readFile, writeFile } from 'node:fs/promises'
import { idMiddle, idAndPrivate, GenResult } from '../../common/id'
import { json, text } from 'co-body'
import { normalizeCode } from '../../common/codes'
import { fileExists } from '../../common/files'
import { verifyLive } from '../../common/verify'

const app = new Koa()
export default app
const port = 3001

const brokerPrefix = '/broker/'
const brokerBrokersPrefix = brokerPrefix + 'brokers/'
const brokerRegisterPrefix = brokerPrefix + 'register/'

const generateKeyPair = promisify(gkp)

const id: any = { }

const idMid = idMiddle(__dirname, false, async () => {
    return { id: id.id }
}).fn

interface Information {
    id: string
    url: string
    kind?: string
}

const info = new Map<string, Information>()

app.use(idMid)
app.use(async function (ctx,  next) {
    if (ctx.path == brokerBrokersPrefix && ctx.method == 'GET') {
        const brokers: string[] = []
        for (const entry of info.values()) {
            if (entry.kind == 'broker') {
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
                    info.set(normalId, { id: normalId, url, kind: entry.kind })
                    save().catch(e => console.log(e))
                    ctx.body = { id: id.id.toString('hex') }
                } else {
                    ctx.throw(400, `Url "${entry.url}" is not reachable`)
                }
                return
            }
        }
    }
    if (ctx.path.startsWith(brokerPrefix) && ctx.method == 'GET') {
        const id = ctx.path.slice(brokerPrefix.length)
        const result = info.get(id)
        if (result) {
            if (ctx.header['accept']?.startsWith('text/plain')) {
                ctx.body = [`ID: ${id}`, `URL: ${result.url}`].join("\n")
            } else {
                ctx.body = {
                    id,
                    url: result.url
                }
            }
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
    if (now < lastSaved + duration) return
    saving = true
    try {
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

async function startup() {
    await restore()
    await idAndPrivate(__dirname, id, async () => {
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

if (!module.parent) {
    app.listen(port)
    startup().catch(e => console.error(e))
    console.log(`Listening on localhost:${port}`)
}

