import Koa from 'koa'
import { getBrokerUrl, getFileLayerUrl, getSlotsUrl } from '../../common/config'
import { BrokerWebClient } from '../../broker/web/broker_web_client'
import { FileLayer } from '../file_layer'
import { normalizeCode } from '../../common/codes'
import { mockSlots } from '../../slots/mock/slots_mock_client'
import { fileLayerWebHandlers } from './file_layer_web_handler'
import { logHandler } from '../../common/web'

const app = new Koa()

const brokerUrl = getBrokerUrl()
// const slotsUrl = getSlotsUrl()

const storageId = normalizeCode(process.argv[2])!!
if (!storageId) {
    error("Expected a storage ID parameter")
}

const rootId = normalizeCode(process.argv[3])!!
if (!rootId) {
    error("Expected a slot ID parameter")
}

const fileLayerUrl = getFileLayerUrl()

async function startup() {
    console.log("Starting on", fileLayerUrl)
    // Create the broker
    const broker = new BrokerWebClient(brokerUrl)

    // Find the storage
    const storage = await broker.storage(storageId)
    if (!storage) {
        error(`Could not find the storage: ${storage}`)
    }

    const slots = mockSlots()

    const layer = new FileLayer(storage, slots, broker, 500)
    await layer.mount({ address: rootId })

    const log = logHandler('file-layer')
    const handlers = fileLayerWebHandlers(layer)

    app.use(log)
    app.use(handlers)
    console.log("Fully started")
}

const port = parseInt(fileLayerUrl.port)
app.listen(port)
startup().catch(e => error(e.message))

function error(msg: string): never {
    console.error(msg)
    process.exit(1)
}