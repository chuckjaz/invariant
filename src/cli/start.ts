import Koa from 'koa'
import { Server as HttpServer} from 'node:http'
import { CommandModule } from "yargs"
import { loadConfiguration, Server, ServerConfiguration } from "../config/config"
import { BrokerClient } from '../broker/broker_client'
import { BrokerWebClient } from '../broker/web/broker_web_client'
import { logHandler } from '../common/web'
import { storageHandlers } from '../storage/web/storage_web_handlers'
import { LocalStorage } from '../storage/local/local_storage'
import { LocalBrokerServer } from '../broker/local/broker_local_server'
import { brokerHandlers } from '../broker/web/broker_web_handler'
import { error } from '../common/errors'
import { Files } from '../files/files'
import { StorageClient } from '../storage/storage_client'
import { FindClient } from '../find/client'
import { BlockFindingStorage } from '../storage/find/storage_find'
import { StorageCache } from '../storage/cache/storage_cache'
import { SlotsClient } from '../slots/slot_client'
import { mockSlots } from '../slots/mock/slots_mock_client'
import { filesWebHandlers } from '../files/web/files_web_handler'
import { LocalSlots } from '../slots/local/slots_local'
import { slotsHandler } from '../slots/web/slots_web_handler'
import { findHandlers } from '../find/web/find_handlers'
import { findServer } from '../find/server'
import { LocalProduction as LocalProductions } from '../productions/local/local_productions'
import { productionHandlers } from '../productions/web/web_productions_handler'

const starters: { [index: string]: (config: ServerConfiguration, broker?: BrokerClient) => Promise<any>} = {
    'broker': startBroker,
    'files': startFiles,
    'find': startFind,
    'productions': startProductions,
    'slots': startSlots,
    'storage': startStorage,
}

export default {
    command: 'start [service]',
    describe: `Start configured services`,
    builder: yargs => {
        return yargs.positional('service', {
            describe: 'The service to start, or all to start all configured services',
            choices: ['all', ...Object.keys(starters)],
            default: 'all'
        })
    },
    handler: argv => { start((argv as any).service) }
} satisfies CommandModule

async function start(choice: string) {
    const configuration = await loadConfiguration()
    const servers = configuration.servers
    if (servers) {
        console.log('Starting services...')
        let broker = configuration.broker ? new BrokerWebClient(configuration.broker) : undefined
        for (const service of servers) {
            const server = service.server
            if (server == choice || choice == "all") {
                const fn = starters[server]
                if (!fn) error(`Unknown server ${server} in configuration`)
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


function listening(name: string, id: string, httpServer: HttpServer, directory?: string): number {
    const address = httpServer.address()
    if (address == null || typeof address == "string") error("Not an active HTTP server");
    console.log(`${name} ${id}: Listening on port ${address.port}${directory ? `, directory: ${directory}` : ''}`)
    return address.port
}

async function startBroker(config: ServerConfiguration, broker?: BrokerClient): Promise<BrokerClient | undefined> {
    console.log("Starting broker server")
    if (config.server != "broker") error("Unexpected configuration")
    const app = new Koa()
    const server = new LocalBrokerServer(config.directory, config.id)
    app.use(logHandler("broker"))
    app.use(brokerHandlers(server))
    const httpServer = app.listen(config.port)
    const port = listening("Broker", config.id, httpServer, config.directory)
    if (broker && config.url) {
        broker.register(config.id, config.url, 'broker').catch(e => console.error(e))
    }
    if (config.primary) {
        return new BrokerWebClient(new URL(`http://localhost:${port}`), config.id)
    }
}

async function startFiles(config: ServerConfiguration, broker?: BrokerClient) {
    console.log("Starting files server")
    if (config.server != "files") error("Unexpected configuration");
    if (!broker) error("Files require a broker connection to be configured");
    let storage = await findStorage(broker)
    if (!storage) error("Could not find a storage to use");

    if (config.cache) {
        const backingStorage = new LocalStorage(config.cache.directory)
        storage = new StorageCache(storage, backingStorage, config.cache.size)
    }

    const slots = config.mount?.slot ? await firstSlots(broker) : mockSlots()
    if (!slots) error("Could not find a slots server");

    const files = new Files(storage, slots, broker, config.syncFrequency)

    if (config.mount) {
        await files.mount(config.mount)
    }
    const filesHandlers = filesWebHandlers(files)
    const app = new Koa()
    app.use(logHandler("files"))
    app.use(filesHandlers)
    const httpServer = app.listen(config.port)
    listening("Files", config.id, httpServer)
}

async function startProductions(config: ServerConfiguration, broker?: BrokerClient) {
    console.log("Starting productions server")
    if (config.server != 'productions') error("Unexpected configuration")
    const productions = new LocalProductions(config.directory, config.id)
    const handlers = productionHandlers(productions)
    const app = new Koa()
    app.use(logHandler("productions"))
    app.use(handlers)
    const httpServer = app.listen(config.port)
    listening("Productions", config.id, httpServer)
    if (broker && config.url) {
        broker.register(config.id, config.url, 'productions').catch(e => console.error(e))
    }
}

async function startStorage(config: ServerConfiguration, broker?: BrokerClient) {
    console.log("Starting storage server")

    const app = new Koa()

    const client = new LocalStorage(config.directory, config.id)
    app.use(logHandler("storage"))
    app.use(storageHandlers(client, broker))
    const httpServer = app.listen(config.port)
    listening("Storage", config.id, httpServer, config.directory)

    if (broker && config.url) {
        broker.register(config.id, config.url, 'storage').catch(e => console.error(e))
    }
}

async function startSlots(config: ServerConfiguration, broker?: BrokerClient) {
    console.log("Starting slots server")
    if (config.server != 'slots') error("Unexpected slots configuration")
    const app = new Koa()
    const client = new LocalSlots(config.directory, config.id)
    const httpServer = app.listen(config.port)
    const handlers = slotsHandler(client)
    app.use(logHandler('slots'))
    app.use(handlers)
    listening("Slots", config.id, httpServer, config.directory)

    if (broker && config.url) {
        broker.register(config.id, config.url, 'slots').catch(e => console.error(e))
    }
}

async function startFind(config: ServerConfiguration, broker?: BrokerClient) {
    console.log("Starting find server")
    if (config.server != 'find') error("Unexpected find configuration");
    if (!broker) error("Find server requires a broker")
    const app = new Koa()
    const client = await findServer(broker, config.id)
    const httpServer = app.listen(config.port)
    const handlers = findHandlers(client, broker)
    app.use(logHandler('Find'))
    app.use(handlers)
    listening("Find", config.id, httpServer)

    if (config.url) {
        broker.register(config.id, config.url, 'find').catch(e => console.error(e))
    }
}

async function findStorage(broker: BrokerClient): Promise<StorageClient | undefined> {
    const finder = await firstFinder(broker)
    const storage = await firstStorage(broker);
    if (!finder) return storage
    return new BlockFindingStorage(broker, finder, storage)
}

interface PingClient {
    ping(): Promise<string | undefined>
}

export async function firstServer<S extends PingClient>(
    broker: BrokerClient,
    kind: string,
    get: (id: string) => Promise<S | undefined>
): Promise<S | undefined> {
    const ids = await broker.registered(kind)
    for await (const id of ids) {
        const server = await get(id)
        if (!server) continue
        const ping = await server.ping()
        if (!ping) continue
        return server
    }
}

export async function firstStorage(broker: BrokerClient): Promise<StorageClient | undefined> {
    return firstServer(broker, 'storage', id => broker.storage(id))
}

export async function firstFinder(broker: BrokerClient): Promise<FindClient | undefined> {
    return firstServer(broker, 'find', id => broker.find(id))
}

export async function firstSlots(broker: BrokerClient): Promise<SlotsClient | undefined> {
    return firstServer(broker, 'slots', id => broker.slots(id))
}