import { homedir } from 'node:os'
import * as path from 'path'
import * as fs from 'node:fs/promises'
import { ContentLink } from '../common/types'
import { invalid } from '../common/errors'
import { fileExists } from '../common/files'

export interface Configuration {
    configPath: string
    broker?: URL
    servers?: ServerConfiguration[]
    tools?: ToolConfiguration[]
    options?: any
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
    private?: boolean
    port?: number
    directory: string
    urls?: URL[]
}

export interface BrokerConfiguration extends CommonServerConfiguration {
    server: "broker"
    primary?: boolean
}

export interface DistributeConfiguration extends CommonServerConfiguration {
    server: "distribute"
    replication?: number
    serverIds?: string[]
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
    args?: string[]
    log?: string
}

interface ServerConfigurationJson {
    server: string
    id: string
    port?: number
    directory?: string
    urls?: string[]
    primary?: boolean
    storage?: string
    slots?: string
    mount?: any
    cache?: any
    syncFrequency?: number
    serverIds?: string[]
    replication?: number
}

interface ToolConfigurationJson {
    tool: string
    path?: string
    args?: string[]
    log?: string
}

interface ConfigurationJson {
    broker: string
    servers?: ServerConfigurationJson[]
    tools?: ToolConfigurationJson[]
    options?: any
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
            let urls: URL[] | undefined = undefined
            let urlsStrings = server.urls
            if (urlsStrings) urls = urlsStrings.map(u => new URL(u))
            switch (server.server) {
                case "broker":
                    servers.push({
                        server: server.server,
                        id: server.id,
                        port: server.port,
                        directory,
                        urls,
                        primary: server.primary
                    })
                    break
                case "distribute":
                    servers.push({
                        server: server.server,
                        id: server.id,
                        port: server.port,
                        directory,
                        urls,
                        serverIds: server.serverIds,
                        replication: server.replication
                    })
                    break
                case "find":
                case "productions":
                case "slots":
                case "storage":
                    servers.push({
                        server: server.server,
                        id: server.id,
                        port: server.port,
                        directory,
                        urls
                    })
                    break
                case "files":
                    servers.push({
                        server: "files",
                        id: server.id,
                        port: server.port,
                        directory,
                        urls,
                        mount: server.mount,
                        cache: server.cache,
                        syncFrequency: server.syncFrequency
                    })
                    break
            }
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
                        path: toolPath,
                        args: tool.args,
                        log: tool.log,
                    })
            }
        }
    }
    const options = json.options

    const result: Configuration = {
        configPath: configurationPath(),
        broker: json.broker ? new URL(json.broker) : undefined,
        servers,
        tools,
        options
    }
    return  result
}

export async function saveConfiguration(configuration: Configuration) {
    const location = configurationConfigPath()
    const { configPath, ...configToWrite } = configuration
    const jsonText = JSON.stringify(configToWrite, null, "    ")
    await fs.writeFile(location, jsonText, 'utf-8')
}

export async function configurationExists(): Promise<boolean> {
    const location = configurationConfigPath()
    return await fileExists(location)
}

export function newConfiguration(): Configuration {
    return { configPath: configurationConfigPath() }
}