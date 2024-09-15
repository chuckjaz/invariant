import { text } from 'co-body'
import Koa from 'koa'
import { Broker } from '../../broker/web/broker_client'
import { normalizeCode } from '../../common/codes'
import { getBrokerUrl, FIND_URL, getFindUrl } from '../../common/config'
import { safeParseJson as safeParseJson } from '../../common/parseJson'
import { FindHasRequest, FindNotifyRequest } from '../../common/types'
import { FindClient } from '../client'
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
    } else if (ctx.path.startsWith(findHasPrefx) && ctx.method == 'PUT') {
        const requestText = await text(ctx)
        const request = safeParseJson(requestText) as FindHasRequest
        const container = normalizeCode(request.container)
        const ids = (request.ids ?? []).map(normalizeCode)
        if (container && ids && ids.every(i => i)) {
            await server.has(request.container, request.ids)
            ctx.status = 200
            ctx.body = ''
        } else return next()
    } else if (ctx.path.startsWith(findGetPrefix) && ctx.method == 'GET') {
        const id = normalizeCode(ctx.path.slice(findGetPrefix.length))
        if (!id) {
            return next()
        }
        let result =  ''
        const results = await server.find(id)
        for await (const item of results) {
            switch (item.kind) {
                case 'HAS':
                    result += `HAS ${item.container}\n`
                    break
                case 'CLOSER':
                    result += `CLOSER ${item.find}\n`
                    break
            }
        }
        ctx.status = 200
        ctx.body = result
    } else if (ctx.path.startsWith(findNotifyPrefix) && ctx.method == 'PUT') {
        const requiestText = await text(ctx)
        const request = safeParseJson(requiestText) as FindNotifyRequest
        const find = normalizeCode(request.find)
        if (find) {
            await server.notify(find)
            ctx.status = 200
            ctx.body = ''
        } else {
            return next()
        }
    }
})

async function startup(find: URL, brokerUrl: URL) {
    // Create the broker
    const broker = new Broker('', brokerUrl)
    server = await findServer(broker)
    try {
        await broker.register(server.id, find, 'find')
    } catch {
        console.log('WARNING: could not register with broker')
    }
}

if (require.main === module) {
    const broker = getBrokerUrl()
    const find = getFindUrl()
    if (!find.port) {
        throw new Error(`${FIND_URL} should contain a port`)
    }
    const port = parseInt(find.port)
    startup(find, broker).catch(e => {
        console.error(e)
        process.exit(1)
    })

    app.listen(port)
    console.log(`Find listening on ${find}`)
}
