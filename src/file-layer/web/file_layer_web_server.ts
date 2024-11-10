import Koa from 'koa'
import { getBrokerUrl, getSlotsUrl } from '../../common/config'
import { Broker } from '../../broker/web/broker_client'
import { FileLayer } from '../file_layer'
import { normalizeCode } from '../../common/codes'
import { FindClient } from '../../find/client'

const app = new Koa()

const brokerUrl = getBrokerUrl()
// const slotsUrl = getSlotsUrl()

const storageId = normalizeCode(process.argv[2])!!
if (!storageId) {
    error("Expected a storage ID parameter")
}

const slotId = normalizeCode(process.argv[3])!!
if (!slotId) {
    error("Expected a slot ID parameter")
}

async function firstFinderOf(broker: Broker): Promise<FindClient> {
    for await (const findId of await broker.registered('find')) {
        const find = await broker.find(findId)
        if (find && await find.ping()) return find
    }
    error("Could not find a finder")
}

async function startup() {
    // Create the broker
    const broker = new Broker(brokerUrl)

    // Find the storage
    const storage = await broker.storage(storageId)
    if (!storage) {
        error(`Could not find the storage: ${storage}`)
    }
    const finder = await firstFinderOf(broker)

//    const layer = new FileLayer(storage, )
}

console.log('Storage:', storageId)
console.log('Slot:', slotId)

startup()

// const port = parseInt(slotsUrl.port)
// app.listen(port)
// console.log(`Listening on http://localhost:${port}`)
// startup().catch(e => {
//     console.error(e)
//     process.exit(1)
// })

function error(msg: string): never {
    console.error(msg)
    process.exit(1)
}