import Koa from 'koa'
import { normalizeCode } from '../../common/codes'
import { FindClient } from '../client'
import { PassThrough } from 'node:stream'
import { text } from 'co-body'
import { safeaParseJson as safeParseJson } from '../../common/parseJson'
import { FindHasRequest } from '../../common/types'
import { Broker } from '../../broker/web/broker_client'
import { findServer } from '../server'

const app = new Koa()
export default app

const idPrefix = '/id/'
const findGetPrefix = '/find/'
const findHasPrefx = '/find/has/'
const findNotifyPrefix = '/find/notify/'

let server: FindClient

app.use(async function (ctx, next) {
    if (ctx.path == idPrefix) {
        ctx.status = 200
        ctx.body = server.id
        return
    } else if (ctx.path.startsWith(findHasPrefx)) {
        const requestText = await text(ctx)
        const request = safeParseJson(requestText) as FindHasRequest
        await server.has(request.container, request.ids)
        ctx.status = 200
        ctx.body = ''
    } else if (ctx.path.startsWith(findGetPrefix) && ctx.method == 'GET') {
        const id = normalizeCode(ctx.path.slice(findGetPrefix.length))
        if (!id) {
            ctx.body = ''
            return
        }
        const stream = new PassThrough()
        ctx.status = 200
        ctx.body = stream

        const results = await server.find(id)
        for await (const item of results) {
            switch (item.kind) {
                case 'HAS':
                    stream.write(`HAS ${item.container}\n`)
                    break
                case 'CLOSER':
                    stream.write(`CLOSER ${item.find}\n`)
                    break
            }
        }
        stream.end()
        return
    }
})

const BROKER_URL = 'INVARIANT_BROKER_URL'
const FIND_URL = 'INVARIANT_FIND_URL'

function requiredEnv(name: string): string {
    const value = process.env[name]
    if (!value) {
        throw new Error(`${name} not set`)
    }
    return value
}

let port: number

async function startup() {
    // Create the broker
    const brokerUrl = new URL(requiredEnv(BROKER_URL))
    const myUrl = new URL(requiredEnv(FIND_URL))
    if (!myUrl.port) {
        throw new Error(`${FIND_URL} should contain a port`)
    }
    port = parseInt(myUrl.port)
    const broker = new Broker('', brokerUrl)
    server = await findServer(broker)
    try {
        await broker.register(server.id, myUrl, 'find')
    } catch {
        console.log('WARNING: could not register with broker')
    }
}

if (!module.parent) {
    startup().catch(e => {
        console.error(e)
        process.exit(1)
    })

    app.listen(3002)
    console.log(`Find listening on localhost:${3002}`)
}
