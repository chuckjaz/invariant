import Koa from 'koa'
import { storageHandlers } from './storage_web_handlers'
import { getStorageDirectory, getStorageUrl, optionalBrokerUrl } from '../../common/config'
import { Broker } from '../../broker/web/broker_client'
import { LocalStorage } from '../local/local_storage'
import { BrokerClient } from '../../broker/client'
import { logHandler } from '../../common/web'
const app = new Koa()

const directory = getStorageDirectory(__dirname)
const client = new LocalStorage(directory)

const brokerUrl = optionalBrokerUrl()
const storageUrl = getStorageUrl()

async function startup() {
    console.log('DIRECTORY', directory)

    // Create the broker client
    let broker: BrokerClient | undefined = brokerUrl ? new Broker(brokerUrl) : undefined
    try {
        if (broker) {
            const id = await client.ping()
            await broker.register(id, storageUrl, 'slots')
        }
    } catch(e: any) {
        broker = undefined
        console.log(`WARNING: could not register with broker: ${e.message}`)
    }
    app.use(logHandler())
    app.use(storageHandlers(client, broker))
    console.log('Fully initialized')
}

const port = parseInt(storageUrl.port)
app.listen(port)
console.log(`Listening on http://localhost:${port}, directory: ${directory}`)
startup().catch(e => {
    console.error(e)
    process.exit(1)
})
