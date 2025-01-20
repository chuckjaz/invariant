import { homedir } from 'node:os'
import * as path from 'path'
import * as fs from 'node:fs/promises'
import { ContentLink } from '../common/types'
import { invalid } from '../common/errors'

export interface Configuration {
    broker?: URL
    servers?: ServerConfiguration[]
    tools?: ToolConfiguration[]
}

export type Server = "broker" | "distribute" | "find" | "files" | "productions" | "slots" | "storage"

export type ServerConfiguration =
    BrokerConfiguration |
    DistributeConfiguration |
    FindConfiguration |
    FilesConfiguration |
    ProductionsConfiguration |
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

export interface DistributeConfiguration extends CommonServerConfiguration {
    server: "distribute"
}

export interface FilesConfiguration extends CommonServerConfiguration {
    server: "files"
    syncFrequency?: number
    mount?: ContentLink
    cache?: {
        directory: string,
        size: number
    }
}

export interface FindConfiguration extends CommonServerConfiguration {
    server: "find"
}

export interface ProductionsConfiguration extends CommonServerConfiguration {
    server: "productions"
}

export interface SlotsConfiguration extends CommonServerConfiguration {
    server: "slots"
}

export interface StorageConfiguration extends CommonServerConfiguration {
    server: "storage"
}

export type ToolConfiguration = FuseToolConfiguration

export interface FuseToolConfiguration {
    tool: "fuse"
    path: string
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
    mount?: any
    cache?: any
    syncFrequency?: number
}

interface ToolConfigurationJson {
    tool: string
    path?: string
}

interface ConfigurationJson {
    broker: string
    servers?: ServerConfigurationJson[]
    tools?: ToolConfigurationJson[]
}


function configurationPath(): string {
    return path.join(homedir(), '.invariant')
}
function configurationConfigPath(): string {
    return path.join(configurationPath(), 'config.json')
}

export async function loadConfiguration(): Promise<Configuration> {
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
                case "productions":
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
                    servers.push({
                        server: "files",
                        id: server.id,
                        port: server.port,
                        directory,
                        url,
                        mount: server.mount,
                        cache: server.cache,
                        syncFrequency: server.syncFrequency
                    })
                    break
            }
        }
        const toolsJson = json.tools
        const tools: ToolConfiguration[] = []
        if (toolsJson) {
            for (const tool of toolsJson) {
                switch (tool.tool) {
                    case "fuse":
                        if (!tool.path) invalid("configuration: tool fuse path required")
                        const toolPath = path.resolve(configurationPath(), tool.path)
                        tools.push({
                            tool: "fuse",
                            path: toolPath
                        })
                }
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