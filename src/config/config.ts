import { homedir } from 'node:os'
import * as path from 'path'
import * as fs from 'node:fs/promises'
import { error } from '../common/errors'

export interface Configuration {
    broker?: URL
    servers?: ServerConfiguration[]
}

export type Server = "broker" | "distribute" | "find" | "files" | "slots" | "storage"

export type ServerConfiguration =
    BrokerConfiguration |
    DistirbuteConfiguration |
    FindConfiguration |
    FilesConfiguration |
    SlotsConfiguration |
    StorageConfiguration

export interface CommonServerConfiguration {
    server: Server
    id: string
    port?: number
    directory: string
    url?: URL
}

export interface BrokerConfiguration extends CommonServerConfiguration {
    server: "broker"
    primary?: boolean
}

export interface DistirbuteConfiguration extends CommonServerConfiguration {
    server: "distribute"
}

export interface FilesConfiguration extends CommonServerConfiguration {
    server: "files"
    syncFrequency?: number
}

export interface FindConfiguration extends CommonServerConfiguration {
    server: "find"
}

export interface SlotsConfiguration extends CommonServerConfiguration {
    server: "slots"
}

export interface StorageConfiguration extends CommonServerConfiguration {
    server: "storage"
}

interface ServerConfigurationJson {
    server: string
    id: string
    port?: number
    directory?: string
    url?: string
    primary?: boolean
    storage?: string
    slots?: string
    syncFrequency?: number
}

interface ConfigurationJson {
    broker: string
    servers?: ServerConfigurationJson[]
}

function configurationPath(): string {
    return path.join(homedir(), '.invariant')
}
function configurationConfigPath(): string {
    return path.join(configurationPath(), 'config.json')
}

export async function loadConfigutation(): Promise<Configuration> {
    const location = configurationConfigPath()
    const jsonText = await fs.readFile(location, 'utf-8')
    const json = JSON.parse(jsonText) as ConfigurationJson
    const serversJson = json.servers
    const servers: ServerConfiguration[] = []
    if (serversJson) {
        for (const server of serversJson) {
            let directory = server.directory
            if (directory) directory = path.resolve(configurationPath(), directory)
            else directory = configurationPath()
            let url: URL | undefined = undefined
            let urlString = server.url
            if (urlString) url = new URL(urlString)
            switch (server.server) {
                case "broker":
                    servers.push({
                        server: server.server,
                        id: server.id,
                        port: server.port,
                        directory,
                        url,
                        primary: server.primary
                    })
                    break
                case "distribute":
                case "find":
                case "slots":
                case "storage":
                    servers.push({
                        server: server.server,
                        id: server.id,
                        port: server.port,
                        directory,
                        url
                    })
                    break
                case "files":
                    if (!server.storage) error("Files require a storage in the configuraton")
                    if (!server.slots) error("Files require a slots in the configuration")
                    servers.push({
                        server: server.server,
                        id: server.id,
                        port: server.port,
                        directory,
                        url,
                        syncFrequency: server.syncFrequency
                    })
                    break
            }
        }
    }

    const result: Configuration = {
        broker: json.broker ? new URL(json.broker) : undefined,
        servers
    }
    return  result
}

export async function saveConfiguration(configuration: ServerConfiguration) {
    const location = configurationConfigPath()
    const jsonText = JSON.stringify(configuration)
    await fs.writeFile(location, jsonText, 'utf-8')
}