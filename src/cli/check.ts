import { homedir } from 'node:os'
import * as path from 'path'
import * as fs from 'node:fs/promises'
import { fileExists } from '../common/files'
import { BrokerWebClient } from '../broker/web/broker_web_client'
import { BrokerClient } from '../broker/client'
import { loadConfigutation } from '../config/config'

export default {
    command: 'check',
    describe: `Check the configuration`,
    handler: () => check()
}

function configurationPath(): string {
    return path.join(homedir(), '.invariant', 'config.json')
}

async function check() {
    // Load the configuration file
    const configurationDir = configurationPath()
    if (!await fileExists(configurationDir)) {
        error(notConfigured)
    }

    const configuration = await loadConfigutation()

    const brokerUrl = configuration.broker
    if (!brokerUrl) {
        error(notConnected)
    }
    const broker = new BrokerWebClient(brokerUrl)
    const {id: brokerId, time } = await timePing('Broker', broker)
    if (!brokerId) {
        error(brokerNotResposnding(brokerUrl))
    }

    reportKind('broker', broker)
    reportKind('distribute', broker)
    reportKind('find', broker)
    reportKind('slots', broker)
    reportKind('storage', broker)
}

type ServersKind = "broker" | "distribute" | "find" | "storage" | "slots"

async function reportKind(kind: ServersKind, broker: BrokerClient) {
    for await (const id of await broker.registered(kind)) {
        let pingable: Pingable | undefined
        switch (kind) {
            case 'storage': pingable = await broker.storage(id); break;
            case 'slots': pingable = await broker.slots(id); break;
            case 'find': pingable = await broker.find(id); break;
            case 'broker': pingable = await broker.broker(id); break;
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
    const end = Date.now()
    const time = end - start
    if (ping) {
        console.log(`${name}: ${ping} - ${time}ms`)
        if (id && ping != id) {
            console.error(`${name}: ${id} reported ${ping} as id`)
        }
    } else {
        console.log(`${name}: Not repsponding after - ${time}ms`)
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

function brokerNotResposnding(url: URL): string {
    return `Broker is not responding.

The broker at ${url} is not responding.`
}
