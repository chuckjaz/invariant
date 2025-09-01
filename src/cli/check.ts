import { homedir } from 'node:os'
import * as path from 'path'
import { fileExists } from '../common/files'
import { BrokerWebClient } from '../broker/web/broker_web_client'
import { BrokerClient } from '../broker/broker_client'
import { loadConfiguration, Server } from '../config/config'
import yargs from 'yargs'

export default {
    command: 'check [broker]',
    describe: `Check the configuration`,
    handler: yargs =>
        check((yargs as any).broker)
} satisfies yargs.CommandModule

function configurationPath(): string {
    return path.join(homedir(), '.invariant', 'config.json')
}

async function check(specifiedUrl?: string) {
    // Load the configuration file
    const configurationDir = configurationPath()
    if (!await fileExists(configurationDir)) {
        error(notConfigured)
    }

    const configuration = await loadConfiguration()

    const brokerUrl = (specifiedUrl ? new URL(specifiedUrl) : undefined) ?? configuration.broker
    if (!brokerUrl) {
        error(notConnected)
    }
    const broker = new BrokerWebClient(brokerUrl)
    const {id: brokerId, time } = await timePing('Broker', broker)
    if (!brokerId) {
        error(brokerNotResponding(brokerUrl))
    }

    reportKind('broker', broker)
    reportKind('distribute', broker)
    reportKind('files', broker)
    reportKind('find', broker)
    reportKind('names', broker)
    reportKind('slots', broker)
    reportKind('storage', broker)
}

async function reportKind(kind: Server, broker: BrokerClient) {
    for await (const id of broker.registered(kind)) {
        let pingable: Pingable | undefined
        switch (kind) {
            case 'storage': pingable = await broker.storage(id); break;
            case 'slots': pingable = await broker.slots(id); break;
            case 'find': pingable = await broker.find(id); break;
            case 'broker': pingable = await broker.broker(id); break;
            case 'names': pingable = await broker.names(id); break;
            case 'files':
            case 'distribute':
                console.log(`${kind}: check not supported yet`)
                continue
            default: error(`Unknown server kind: ${kind}`)
        }
        if (!pingable) {
            console.log(`  ${kind}: ${id} was reported by the broker but the broker couldn't find it`)
        } else {
            timePing(kind, pingable, id)
        }
    }
}

interface Pingable {
    ping(): Promise<string | undefined>
}

async function timePing(name: string, pingable: Pingable, id?: string): Promise<{ id: string | undefined, time: number}> {
    const start = Date.now()
    const ping = await pingable.ping()
    if (!ping) {
        console.error(`${name}: could not ping ${id}`)
        return { id: id ?? '' , time: 0 }
    }
    const end = Date.now()
    const time = end - start
    if (ping) {
        console.log(`${name}: ${ping} - ${time}ms`)
        if (id && ping != id) {
            console.error(`${name}: ${id} reported ${ping} as id`)
        }
    } else {
        console.log(`${name}: Not responding after - ${time}ms`)
    }
    return { id: ping, time }
}

interface ConfigurationJson {
    broker: string
    finder?: string
    storage?: string
    slots?: string
}

function error(msg: string): never {
    console.error(msg)
    process.exit(1)
}

const notConnected = `Invariant is not connected to a broker

Try running,

  invariant connect

to connect with an existing broker
`

const notConfigured = `Invariant has not been configured.

Try running,

  invariant start

to create the initial configuration file
`

function brokerNotResponding(url: URL): string {
    return `Broker is not responding.

The broker at ${url} is not responding.`
}
