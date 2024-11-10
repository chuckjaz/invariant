import Koa from 'koa'
import { storageHandlers } from './storage_web_handlers'
import { getBrokerUrl, getStorageDirectory, getStorageUrl } from '../../common/config'
import { Broker } from '../../broker/web/broker_client'
import { LocalStorage } from '../local/local_storage'
import { BrokerClient } from '../../broker/client'
import { logHandler } from '../../common/web'
const app = new Koa()

const directory = getStorageDirectory()
const client = new LocalStorage(directory)

const brokerUrl = getBrokerUrl()
const storageUrl = getStorageUrl()

async function startup() {
    // Create the broker
    let broker: BrokerClient | undefined = new Broker(brokerUrl)
    app.use(logHandler("storage"))
    app.use(storageHandlers(client, broker))
    try {
        await broker.register(client.id, storageUrl, 'slots')
    } catch(e: any) {
        broker = undefined
        console.log(`WARNING: could not register with broker: ${e.message}`)
    }
    console.log('Fully initialized')
}

const port = parseInt(storageUrl.port)
app.listen(port)
console.log(`Listening on http://localhost:${port}, directory: ${directory}`)
startup().catch(e => {
    console.error(e)
    process.exit(1)
})
