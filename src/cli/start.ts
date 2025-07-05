import Koa from 'koa'
import { Server as HttpServer} from 'node:http'
import { CommandModule } from "yargs"
import { loadConfiguration, Server, ServerConfiguration } from "../config/config"
import { BrokerClient } from '../broker/broker_client'
import { BrokerWebClient } from '../broker/web/broker_web_client'
import { logger, logHandler, logHandlerOf } from '../common/web'
import { storageHandlers } from '../storage/web/storage_web_handlers'
import { LocalStorage } from '../storage/local/local_storage'
import { LocalBrokerServer } from '../broker/local/broker_local_server'
import { brokerHandlers } from '../broker/web/broker_web_handler'
import { error, invalid } from '../common/errors'
import { Files } from '../files/files'
import { ManagedStorageClient, StorageClient } from '../storage/storage_client'
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
import { LocalProductions as LocalProductions } from '../productions/local/local_productions'
import { productionHandlers } from '../productions/web/web_productions_handler'
import { findUrls } from '../common/findurl'
import { delay } from '../common/delay'
import { Distribute } from '../distribute/distribute'
import { distributeHandlers } from '../distribute/web/distribute_web_handlers'
import { DistributeClient } from '../distribute/distribute_client'
import { allOfStream } from '../common/data'

const starters: { [index: string]: (config: ServerConfiguration, broker?: BrokerClient) => Promise<any>} = {
    'broker': startBroker,
    'distribute': startDistribute,
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
        }).option('id', {
            describe: 'The id of the service to start',
            array: true
        }).option('private', {
            alias: 'p',
            describe: 'Do not register the service with the broker',
            boolean: true
        }).option('broker', {
            alias: 'b',
            describe: 'The URL for the broker to use',
            string: true
        })
    },
    handler: (argv: any) => {
        start(argv.service, argv.id, argv.private, argv.broker)
    }
} satisfies CommandModule

function contains(item: string, items: string[]): boolean {
    return items.indexOf(item) >= 0
}

async function start(choice: string, ids?: string[], _private?: boolean, brokerUrl?: string) {
    const configuration = await loadConfiguration()
    const servers = configuration.servers
    if (servers) {
        let started = false
        const url = (brokerUrl ? new URL(brokerUrl) : undefined) ?? configuration.broker
        let broker = url ? new BrokerWebClient(url) : undefined
        for (const service of servers) {
            const server = service.server
            if ((server == choice || choice == "all") && (ids == undefined || contains(service.id, ids))) {
                const fn = starters[server]
                if (!fn) error(`Unknown server ${server} in configuration`);
                const primary = await fn(service, _private ? undefined : broker)
                started = true
                if (primary && server == "broker" && service.primary) {
                    broker = primary
                }
            }
        }
        if (!started) {
            console.error("No services started")
        }
    } else {
        console.error('No services configured')
    }
}

async function waitForBroker(broker?: BrokerClient) {
    if (!broker) return
    let tries = 0
    while (tries < 5) {
        try {
            let result = await broker.ping()
            if (result) return
        } catch (e) {
            console.log('caught', e)
        }
        if (tries == 0) {
            console.log("Waiting for the broker to start")
        }
        tries++
        delay(50 * tries)
    }
    error('Could not find the broker')
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
    if (broker && config.urls) {
        await waitForBroker(broker)
        broker.register(config.id, config.urls, 'broker').catch(e => console.error(e))
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

    const files = new Files(config.id, storage, slots, broker, config.syncFrequency)

    if (config.mount) {
        await files.mount(config.mount)
    }
    const filesHandlers = filesWebHandlers(files)
    const app = new Koa()
    app.use(logHandler("files"))
    app.use(filesHandlers)
    const httpServer = app.listen(config.port)
    listening("Files", config.id, httpServer)
    registerServer(config, httpServer, 'files', broker)
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
    await registerServer(config, httpServer, 'productions', broker)
}

async function registerServer(
    config: ServerConfiguration,
    httpServer: HttpServer,
    kind?: string,
    broker?: BrokerClient
): Promise<void> {
    if (broker && !config.private) {
        let urls = config.urls
        if (!urls) {
            urls = []
            const address = httpServer.address()
            if (address && typeof address != 'string') {
                urls = await findUrls(config.port ?? address.port)
            }
        }
        if (urls && urls.length) {
            await waitForBroker(broker)
            console.log(`Registering ${kind} ${config.id} to broker on ${urls.map(u => u.toString()).join()}`)
            broker.register(config.id, urls, kind).catch(e => console.error(e))
        }
    }
}

async function startStorage(config: ServerConfiguration, broker?: BrokerClient) {
    console.log("Starting storage server")

    const app = new Koa()

    const client = new LocalStorage(config.directory, config.id)
    app.use(logHandler(`storage-${shortId(config.id)}`))
    app.use(storageHandlers(client, broker))
    const httpServer = app.listen(config.port)
    listening("Storage", config.id, httpServer, config.directory)
    await registerServer(config, httpServer, 'storage', broker)

    // Let the finder know all the block we already have
    if (broker) {
        // Intentionally don't await this so it is in parallel to the other starts
        bootstrapFinder(broker, client)
    }
}

async function bootstrapFinder(broker: BrokerClient, storage: ManagedStorageClient) {
    const finder = await firstFinder(broker)
    if (!finder) return
    const id = await storage.ping()
    if (!id) return

    const blocks = (await allOfStream(storage.blocks())).map(b => b.address)
    await finder.has(id, blocks)
    console.log(`storage-${shortId(id)} fully started`)
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
    await registerServer(config, httpServer, 'slots', broker)
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
    await registerServer(config, httpServer, 'find', broker)
}

async function startDistribute(config: ServerConfiguration, broker?: BrokerClient) {
    if (config.server != 'distribute') error("Unexpected distribute configuration");
    if (!broker) error("Distribute server requires broker")
    const app = new Koa()
    const log = logger('distribute')
    const client = new Distribute(broker, config.id, config.replication, undefined, log)
    const httpServer = app.listen(config.port)
    const handlers = distributeHandlers(client)
    app.use(logHandlerOf(log))
    app.use(handlers)
    listening("Distribute", config.id, httpServer)
    await registerServer(config, httpServer, 'distribute', broker)
    if (config.serverIds) {
        await client.register(sendAll(config.serverIds))
    }
}

async function *sendAll<T>(arr: T[]): AsyncIterable<T> {
    yield *arr
}

function shortId(id: string): string {
    return id.substring(0, 5)
}

export async function findStorage(broker: BrokerClient): Promise<StorageClient | undefined> {
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

export async function defaultStorage(broker: BrokerClient): Promise<StorageClient> {
    const storage = await firstStorage(broker)
    if (!storage) invalid("Could not find a storage to use");
    return storage
}

export async function firstFinder(broker: BrokerClient): Promise<FindClient | undefined> {
    return firstServer(broker, 'find', id => broker.find(id))
}

export async function defaultFinder(broker: BrokerClient): Promise<FindClient> {
    const finder = await firstFinder(broker)
    if (!finder) invalid("Could not find a finder to use");
    return finder
}

export async function firstSlots(broker: BrokerClient): Promise<SlotsClient | undefined> {
    return firstServer(broker, 'slots', id => broker.slots(id))
}

export async function defaultSlots(broker: BrokerClient): Promise<SlotsClient> {
    const slots = await firstSlots(broker)
    if (!slots) invalid("Could not find a slots to use");
    return slots
}


export async function firstDistribute(broker: BrokerClient): Promise<DistributeClient | undefined> {
    return firstServer(broker, 'distribute', id => broker.distribute(id))
}