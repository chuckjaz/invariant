import Koa from 'koa'

import { CommandModule } from "yargs"
import { loadConfigutation, Server, ServerConfiguration } from "../config/config"
import { BrokerClient } from '../broker/client'
import { Broker } from '../broker/web/broker_client'
import { logHandler } from '../common/web'
import { storageHandlers } from '../storage/web/storage_web_handlers'
import { LocalStorage } from '../storage/local/local_storage'

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
        const broker = new Broker(configuration.broker)
        for (const service of servers) {
            const server = service.server
            if (server == choice || choice == "all") {
                const fn = starters[server]
                fn(broker, service)
            }
        }
    } else {
        console.error('No services configured')
    }
}

const starters: { [index: string]: (broker: BrokerClient, config: ServerConfiguration) => Promise<void>} = {
    'storage': startStorage
}

async function startStorage(broker: BrokerClient, config: ServerConfiguration) {
    console.log(" Starting storage server")

    const app = new Koa()

    const client = new LocalStorage(config.directory)
    app.use(logHandler("storage"))
    app.use(storageHandlers(client, broker))
    app.listen(config.port)
    console.log(` Storage ${config.id}: Listening on http://localhost:${config.port}, directory: ${config.directory}`)

    if (config.url) {
        await broker.register(config.id, config.url, 'storage')
    }
}
