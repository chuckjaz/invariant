import Koa from 'koa'

import { CommandModule } from "yargs"
import { loadConfigutation, Server, ServerConfiguration } from "../config/config"
import { BrokerClient } from '../broker/client'
import { BrokerWebClient } from '../broker/web/broker_web_client'
import { logHandler } from '../common/web'
import { storageHandlers } from '../storage/web/storage_web_handlers'
import { LocalStorage } from '../storage/local/local_storage'
import { LocalBrokerServer } from '../broker/local/broker_local_server'
import { brokerHandlers } from '../broker/web/broker_web_handler'

export default {
    command: 'start [service]',
    describe: `Start configurated services`,
    builder: yargs => {
        return yargs.positional('service', {
            describe: 'The service to start, or all to start all configured services',
            choices: ['all', 'broker', 'distribute', 'find', 'slots', 'storage'],
            default: 'all'
        })
    },
    handler: argv => { start((argv as any).service) }
} satisfies CommandModule

async function start(choice: string) {
    const configuration = await loadConfigutation()
    const servers = configuration.servers
    if (servers) {
        console.log('Starting services...')
        let broker = configuration.broker ? new BrokerWebClient(configuration.broker) : undefined
        for (const service of servers) {
            const server = service.server
            if (server == choice || choice == "all") {
                const fn = starters[server]
                const primary = await fn(service, broker)
                if (primary && server == "broker" && service.primary) {
                    broker = primary
                }
            }
        }
    } else {
        console.error('No services configured')
    }
}

const starters: { [index: string]: (config: ServerConfiguration, broker?: BrokerClient) => Promise<any>} = {
    'broker': startBroker,
    'storage': startStorage
}

async function startBroker(config: ServerConfiguration, broker?: BrokerClient): Promise<BrokerClient | undefined> {
    console.log("Starting broker server")

    const app = new Koa()
    const server = new LocalBrokerServer(config.directory, config.id)
    app.use(logHandler("broker"))
    app.use(brokerHandlers(server))
    app.listen(config.port)
    console.log(`Broker ${config.id}: Listening on http://localhost:${config.port}, directory: ${config.directory}`)
    if (broker && config.url) {
        broker.register(config.id, config.url, 'broker').catch(e => console.error(e))
    }
    if (config.primary) {
        return new BrokerWebClient(new URL(`http://localhost:${config.port}`), config.id)
    }
}

async function startStorage(config: ServerConfiguration, broker?: BrokerClient) {
    console.log("Starting storage server")

    const app = new Koa()

    const client = new LocalStorage(config.directory, config.id)
    app.use(logHandler("storage"))
    app.use(storageHandlers(client, broker))
    app.listen(config.port)
    console.log(`Storage ${config.id}: Listening on http://localhost:${config.port}, directory: ${config.directory}`)

    if (broker && config.url) {
        broker.register(config.id, config.url, 'storage').catch(e => console.error(e))
    }
}
