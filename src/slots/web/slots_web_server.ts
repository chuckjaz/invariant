import Koa from 'koa'
import { slotsHandler } from './slots_web_handler'
import { getBrokerUrl, getSlotsDirectory, getSlotsUrl } from '../../common/config'
import { Broker } from '../../broker/web/broker_client'
import { LocalSlots } from '../local/slots_local'
const app = new Koa()

const client = new LocalSlots(getSlotsDirectory())
app.use(slotsHandler(client))

const brokerUrl = getBrokerUrl()
const slotsUrl = getSlotsUrl()

async function startup() {
    // Create the broker
    const broker = new Broker('', brokerUrl)
    try {
        await broker.register(client.id, slotsUrl, 'slots')
    } catch(e: any) {
        console.log(`WARNING: could not register with broker: ${e.message}`)
    }
}

const port = parseInt(slotsUrl.port)
app.listen(port)
console.log(`Listening on http://localhost:${port}`)
startup().catch(e => {
    console.error(e)
    process.exit(1)
})
