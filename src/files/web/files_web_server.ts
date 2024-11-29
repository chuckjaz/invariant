import Koa from 'koa'
import { getBrokerUrl, getFilesUrl, getSlotsUrl } from '../../common/config'
import { BrokerWebClient } from '../../broker/web/broker_web_client'
import { Files } from '../files'
import { normalizeCode } from '../../common/codes'
import { mockSlots } from '../../slots/mock/slots_mock_client'
import { filesWebHandlers } from './files_web_handler'
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

const filesUrl = getFilesUrl()

async function startup() {
    console.log("Starting on", filesUrl)
    // Create the broker
    const broker = new BrokerWebClient(brokerUrl)

    // Find the storage
    const storage = await broker.storage(storageId)
    if (!storage) {
        error(`Could not find the storage: ${storage}`)
    }

    const slots = mockSlots()

    const files = new Files(storage, slots, broker, 500)
    await files.mount({ address: rootId })

    const log = logHandler('files')
    const handlers = filesWebHandlers(files)

    app.use(log)
    app.use(handlers)
    console.log("Fully started")
}

const port = parseInt(filesUrl.port)
app.listen(port)
startup().catch(e => error(e.message))

function error(msg: string): never {
    console.error(msg)
    process.exit(1)
}