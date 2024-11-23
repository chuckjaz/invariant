import { homedir } from 'node:os'
import * as path from 'path'
import * as fs from 'node:fs/promises'

export interface Configuration {
    broker: URL
    servers?: ServerConfiguration[]
}

export type Server = "broker" | "distribute" | "find" | "slots" | "storage"

export interface ServerConfiguration {
    server: Server
    id: string
    port: number
    directory: string
    url?: URL
}

interface ServerConfigurationJson {
    server: string
    id: string
    port: number
    directory?: string
    url?: string
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
            servers.push({
                server: server.server as Server,
                id: server.id,
                port: server.port,
                directory,
                url
            })
        }
    }

    const result: Configuration = {
        broker: new URL(json.broker),
        servers
    }
    return  result
}

export async function saveConfiguration(configuration: ServerConfiguration) {
    const location = configurationConfigPath()
    const jsonText = JSON.stringify(configuration)
    await fs.writeFile(location, jsonText, 'utf-8')
}