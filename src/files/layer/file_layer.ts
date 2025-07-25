import * as path from 'path'
import ignore, { Ignore } from "ignore";
import { ContentLink } from "../../common/types";
import { Data, StorageClient } from "../../storage/storage_client";
import { Node, ContentInformation, FileDirectoryEntry, ContentKind, EntryAttributes, FilesClient, DirectoryContentInformation, FileContentInformation, SymbolicLinkContentInformation } from "../files_client";
import { jsonFromData } from '../../common/data';
import z from 'zod';
import { contentLinkSchema } from '../../common/schema';
import { dataToString } from '../../common/parseJson';
import { invalid } from '../../common/errors';
import { createHash } from 'crypto';
import { Channel } from '../../common/channel';

export interface FileLayer {
    kind: LayerKind
    predicate: (name: string) => boolean
    client: FilesClient
    node?: Node
    layerFor: (name: string, client: FilesClient, node: Node) => FileLayer
}

/**
 * Construct a file layer that accepts all nodes.
 *
 * @param client The client to direct all nodes to
 * @returns a file layer that accepts all nodes.
 */
export function baseLayer(client: FilesClient, node?: Node): FileLayer {
    return { kind: LayerKind.Base, predicate: () => true, client, node, layerFor: (_, __, node) => baseLayer(client, node) }
}

/**
 * Construct a void file layer that doesn't accept any files.
 */
export function voidLayer(client: FilesClient): FileLayer {
    return { kind: LayerKind.Base, predicate: () => false, client, layerFor: () => voidLayer(client) }
}

/**
 * Construct a file layer that ignores all nodes specified by the ignore parameter.
 *
 * @param ignore An ignore specification
 * @param client The to direct all request to for nodes that are not ignored.
 * @returns an ignore file layer
 */
export function ignoreLayer(ignore: Ignore, client: FilesClient, node?: Node): FileLayer {
    function ignoreLayerFor(directory: string, client: FilesClient, node?: Node): FileLayer {
        return {
            kind: LayerKind.Ignore,
            predicate: name => {
                const ignorePath = path.join(directory, name)
                return !ignore.ignores(ignorePath) && !ignore.ignores(ignorePath + '/')
            },
            client,
            node,
            layerFor: (name, layerClient, node) =>
                ignoreLayerFor(path.join(directory, name), client, client == layerClient ? node : undefined)
        }
    }
    return ignoreLayerFor('', client, node)
}

/**
 * Construct an accepts file layer that accepts files. It is an inverted version of ignore.
 */
export function acceptsLayer(accept: Ignore, client: FilesClient, node?: Node): FileLayer {
    function acceptLayerFor(directory: string, client: FilesClient, node?: Node): FileLayer {
        return {
            kind: LayerKind.Accepts,
            predicate: name => {
                const ignorePath = path.join(directory, name)
                return accept.ignores(ignorePath) || accept.ignores(ignorePath + '/')
            },
            client,
            node,
            layerFor: (name, layerClient, node) =>
                acceptLayerFor(path.join(directory, name), client, client == layerClient ? node : undefined)
        }
    }
    return acceptLayerFor('', client, node)
}

export enum LayerKind {
    Base = "Base",
    Accepts = "Accepts",
    Ignore = "Ignore",
}

export type LayerContent = ContentLink | "Self"

export interface BaseLayer {
    kind: LayerKind.Base
    content: LayerContent
    syncFrequency?: number
}

export interface IgnoreLayer {
    kind: LayerKind.Ignore
    content: LayerContent
    syncFrequency?: number
    ignore?: string[]
    ignoreFiles?: string[]
}

export interface AcceptsLayer {
    kind: LayerKind.Accepts
    content: LayerContent
    syncFrequency?: number
    accepts: string[]
}

export type FileLayerDescription = BaseLayer | IgnoreLayer | AcceptsLayer
export type FileLayersDescription = FileLayerDescription[]

const layerContentSchema = z.union([contentLinkSchema, z.literal("Self")])
const baseLayerSchema = z.object({
    kind: z.literal("Base"),
    content: layerContentSchema,
    syncFrequency: z.optional(z.number())
})
const ignoreLayerSchema = z.object({
    kind: z.literal("Ignore"),
    content: layerContentSchema,
    syncFrequency: z.optional(z.number()),
    ignore: z.optional(z.array(z.string())),
    ignoreFiles: z.optional(z.array(z.string()))
})
const acceptLayerSchema = z.object({
    kind: z.literal("Accept"),
    content: layerContentSchema,
    accepts: z.array(z.string()),
    syncFrequency: z.optional(z.number())
})

const fileLayerDescriptionSchema = z.discriminatedUnion('kind', [baseLayerSchema, ignoreLayerSchema, acceptLayerSchema])
const fileLayerDescriptionsSchema = z.array(fileLayerDescriptionSchema)

enum NodeKind {
    Client,
    Directory,
}

interface ClientNode {
    kind: NodeKind.Client
    client: FilesClient
    node: number
}

interface DirectoryNode {
    kind: NodeKind.Directory
    directory: LayeredDirectory
}

type LayerNode = ClientNode | DirectoryNode

interface Realizable {
    findDirectoryNode(client: FilesClient, index: number): Promise<Node | undefined>
    realizeFor(client: FilesClient, index: number): Promise<Node>
    realizedDirectoryNode(client: FilesClient, index: number): Promise<Node>
}

class LayeredDirectory  {
    protected fileLayers: FileLayer[]
    private parent?: Realizable
    private name: string

    constructor(fileLayers: FileLayer[], name: string, parent?: Realizable) {
        this.fileLayers = fileLayers
        this.name = name
        this.parent = parent
    }

    private select(name: string): [FileLayer, number] {
        let index = 0
        for (const layer of this.fileLayers) {
            if (layer.predicate(name)) return [layer, index]
            index++
        }
        return [this.fileLayers[0], 0]
    }

    async info(node: Node): Promise<ContentInformation> {
        const hash = createHash('sha256')
        let createTime = Date.now()
        let modifyTime = 0
        let executable = false
        let writable = false
        for (let index = 0; index < this.fileLayers.length; index++) {
            const layer = this.fileLayers[index]
            const client = layer.client
            const directoryNode = await this.findDirectoryNode(client, index)
            if (directoryNode === undefined) {
                hash.write(undefined)
                continue
            }
            const directoryInfo = await client.info(directoryNode)
            if (directoryInfo === undefined) {
                hash.write(undefined)
                continue
            }
            if (directoryInfo.createTime < createTime) {
                createTime = directoryInfo.createTime
            }
            if (directoryInfo.modifyTime > modifyTime) {
                modifyTime = directoryInfo.modifyTime
            }
            if (directoryInfo.writable) {
                writable = true
            }
            if (directoryInfo.executable) {
                executable = true
            }
            hash.write(directoryInfo.etag)
        }
        if (modifyTime == 0) {
            modifyTime = Date.now()
        }
        const etag = hash.digest().toString('hex')
        return {
            node,
            kind: ContentKind.Directory,
            modifyTime,
            createTime,
            executable,
            writable,
            etag,
            size: 0,
        }
    }

    async setAttributes(node: Node, attributes: EntryAttributes): Promise<ContentInformation> {
        for (const layer of this.fileLayers) {
            const node = await this.realizeNode(layer)
            await layer.client.setAttributes(node, attributes)
        }
        return await this.info(node)
    }

    async rename(name: string, newParentDirectory: LayeredDirectory, newName: string): Promise<void> {
        const [layer, index] = this.select(name)
        const [newLayer, newIndex] = newParentDirectory.select(newName)
        const directoryNode = await this.realizeFor(layer.client, index)
        const newDirectoryNode = await newParentDirectory.realizeFor(newLayer.client, newIndex)
        if (layer.client == newLayer.client) {
            layer.client.rename(directoryNode, name, newDirectoryNode, newName)
        } else {
            // To rename between clients we need create a new node in the new client and remove the
            // node in the old client.
            const info = await layer.client.lookup(directoryNode, name)
            if (info === undefined) return
            switch (info.kind) {
                case ContentKind.Directory: {
                    const content = await layer.client.content(info.node)
                    await newLayer.client.createDirectory(newDirectoryNode, newName, content)
                    break
                }
                case ContentKind.File: {
                    const content = await layer.client.content(info.node)
                    await newLayer.client.createFile(newDirectoryNode, newName, content)
                    break
                }
                case ContentKind.SymbolicLink: {
                    await newLayer.client.createSymbolicLink(newDirectoryNode, newName, info.target)
                    break
                }
            }
            await layer.client.remove(directoryNode, name)
        }
    }

    async remove(name: string): Promise<boolean> {
        const [layer] = this.select(name)
        const parentNode = layer.node
        if (!parentNode) return false
        return layer.client.remove(parentNode, name)
    }

    layerFor(name: string): FileLayer {
        const [layer] = this.select(name)
        return layer
    }

    async lookup(name: string): Promise<[FilesClient, ContentInformation | undefined]> {
        const [layer, index] = this.select(name)
        let parent = await this.findDirectoryNode(layer.client, index)
        if (parent === undefined) return [layer.client, undefined]
        const info = await layer.client.lookup(parent, name)
        return [layer.client, info]
    }

    nested(name: string, client: FilesClient, node: Node): LayeredDirectory {
        const nestedLayers = this.fileLayers.map(layer => layer.layerFor(name, client, node))
        return new LayeredDirectory(nestedLayers, name, this)
    }

    async *readDirectory(): AsyncIterable<[string, FilesClient, ContentInformation]> {
        const sent = new Set<string>()
        let index = 0
        for (const layer of this.fileLayers) {
            const client = layer.client
            const parent = await this.findDirectoryNode(client, index++)
            if (parent === undefined) continue;
            for await (const entry of client.readDirectory(parent)) {
                if (sent.has(entry.name)) continue;
                sent.add(entry.name)
                yield [entry.name, client, entry.info]
            }
        }
    }

    async findDirectoryNode(client: FilesClient, index: number): Promise<Node | undefined> {
        const layer = this.fileLayers[index]
        let directoryNode = layer.node
        if (directoryNode === undefined) {
            const parent = await nRequired(this.parent).findDirectoryNode(client, index)
            if (parent == undefined) return undefined;
            const newDirectoryInfo = await client.lookup(parent, this.name)
            if (newDirectoryInfo === undefined) return undefined;
            layer.node = newDirectoryInfo.node
        }
        return directoryNode
    }

    async realizeNode(layer: FileLayer): Promise<Node> {
        let node = layer.node
        if (!node) {
            const index = this.fileLayers.indexOf(layer)
            node = await this.realizeFor(layer.client, index)
        }
        return node
    }

    async realizeFor(client: FilesClient, index: number): Promise<Node> {
        const parent = await nRequired(this.parent).realizedDirectoryNode(client, index)
        const directoryInfo = await client.lookup(parent, this.name)
        if (directoryInfo === undefined) {
            const realizedInfo = await client.createDirectory(parent, this.name)
            return realizedInfo.node
        }
        return directoryInfo.node
    }

    async realizedDirectoryNode(client: FilesClient, index: number): Promise<Node> {
        const layer = this.fileLayers[index]
        let directoryNode = layer.node
        if (directoryNode === undefined) {
            directoryNode = await nRequired(this.parent).realizeFor(client, index)
            layer.node = directoryNode
        }
        return directoryNode
    }

    async sync(): Promise<void> {
        const clients = new Set<FilesClient>()
        const promises: Promise<void>[] = []
        for (const layer of this.fileLayers) {
            if (clients.has(layer.client)) continue;
            clients.add(layer.client)
            promises.push(layer.client.sync())
        }
        await Promise.all(promises)
    }
}

const defaultFrequency = 10 * 1000

export class LayeredFiles implements FilesClient {
    private id: string
    private controlPlane: FilesClient
    private nextNode = 1
    private map = new Map<Node, LayerNode>()
    private invertNodeMap = new Map<FilesClient, Map<Node, Node>>()

    constructor (
        id: string,
        controlPlane: FilesClient,
    ) {
        this.id = id
        this.controlPlane = controlPlane
    }

    async ping(): Promise<string | undefined> {
        return this.id
    }

    async mount(content: ContentLink): Promise<Node> {
        // `content` should be a link to a control plane which is a directory that contains the
        // layer description in a `.layers` file. The `.layers` file is the only file that
        // is used from this layer though other may be added in the future.
        const controlPlane = this.controlPlane
        const controlNode = await controlPlane.mount(content)

        const layerInfo = await controlPlane.lookup(controlNode, '.layers')
        if (layerInfo === undefined) invalid("Invalid control plain, does not contain a .layer file");
        const layerDescriptions = await jsonFromData(fileLayerDescriptionsSchema, controlPlane.readFile(layerInfo.node))
        if (layerDescriptions == undefined) invalid("Incorrect layer file");

        const rootNode = this.allocNode()

        // Create and mount the layers from the specification
        const fileLayers: FileLayer[] = []
        for (const layerDescription of layerDescriptions) {
            let client = controlPlane
            let layerRoot: Node
            if (layerDescription.content == "Self") {
                layerRoot = controlNode
            } else {
                layerRoot = await client.mount(layerDescription.content as ContentLink)
            }
            let layer: FileLayer
            switch (layerDescription.kind) {
                case "Base":
                    layer = baseLayer(client, layerRoot)
                    break
                case "Accept": {
                    const ig = ignore()
                    if (layerDescription.accepts) {
                        ig.add(layerDescription.accepts)
                    }
                    layer = acceptsLayer(ig, client, layerRoot)
                    break
                }
                case "Ignore": {
                    const ig = ignore()
                    if (layerDescription.ignore) {
                        ig.add(layerDescription.ignore)
                    }
                    if (layerDescription.ignoreFiles) {
                        for (const ignoreFile of layerDescription.ignoreFiles) {
                            const ignoreInfo = await client.lookup(layerRoot, ignoreFile)
                            if (ignoreInfo === undefined) continue;
                            const ignoreText = await dataToString(client.readFile(ignoreInfo.node))
                            ig.add(ignoreText)
                        }
                    }
                    layer = ignoreLayer(ig, client, layerRoot)
                    break
                }
                default: invalid(`Invalid layer specification`)
            }
            fileLayers.push(layer)
        }

        const directory = new LayeredDirectory(fileLayers, '')
        this.map.set(rootNode, { kind: NodeKind.Directory, directory })
        return rootNode
    }

    unmount(node: Node): Promise<ContentLink> {
        invalid("Cannot unmount layered files")
    }

    async lookup(parent: Node, name: string): Promise<ContentInformation | undefined> {
        const directory = this.requireDirectory(parent)
        const [client, clientInfo] = await directory.lookup(name)
        if (clientInfo !== undefined) {
            const newNode = await this.nodeMap(directory, name, client, clientInfo.node, clientInfo.kind)
            clientInfo.node = newNode
            return clientInfo
        }
        return undefined
    }

    async info(node: Node): Promise<ContentInformation> {
        const layerNode = nRequired(this.map.get(node))
        if (layerNode.kind == NodeKind.Client) {
            const clientInfo = await layerNode.client.info(layerNode.node)
            if (clientInfo) clientInfo.node = node
            return clientInfo
        }
        const directory = layerNode.directory
        return directory.info(node)
    }

    content(node: Node): Promise<ContentLink> {
        const { client, node: clientNode } = this.requireFile(node)
        return client.content(clientNode)
    }

    readFile(node: Node, offset?: number, length?: number): Data {
        const { client, node: clientNode } = this.requireFile(node)
        return client.readFile(clientNode, offset, length)
    }

    writeFile(node: Node, data: Data, offset?: number, length?: number): Promise<number> {
        const { client, node: clientNode } = this.requireFile(node)
        return client.writeFile(clientNode, data, offset, length)
    }

    async setSize(node: Node, size: number): Promise<ContentInformation> {
        const { client, node: clientNode } = this.requireFile(node)
        const info = await client.setSize(clientNode, size)
        info.node = node
        return info
    }

    async *readDirectory(parent: Node, offset?: number, length?: number): AsyncIterable<FileDirectoryEntry> {
        const directory = this.requireDirectory(parent)
        let start = offset ?? 0
        let end = length ? start + length : Number.MAX_SAFE_INTEGER
        let index = 0
        for await (const [name, client, info] of directory.readDirectory()) {
            if (index >= start) {
                const node = await this.nodeMap(directory, name, client, info.node, info.kind)
                const mappedInfo = { ...info, node }
                yield { name, info: mappedInfo };
            }
            index++
            if (index >= end) break
        }
    }

    async createDirectory(parent: Node, name: string, content?: ContentLink): Promise<DirectoryContentInformation> {
        const directory = this.requireDirectory(parent)
        const layer = directory.layerFor(name + '/')
        const directoryNode = await directory.realizeNode(layer)
        const info = await layer.client.createDirectory(directoryNode, name, content)
        const newNode = await this.nodeMap(directory, name, layer.client, info.node, ContentKind.Directory)
        info.node = newNode
        return info
    }

    async createFile(parent: Node, name: string, content?: ContentLink): Promise<FileContentInformation> {
        const directory = this.requireDirectory(parent)
        const layer = directory.layerFor(name)
        const directoryNode = await directory.realizeNode(layer)
        const info = await layer.client.createFile(directoryNode, name, content)
        const newNode = await this.nodeMap(directory, name, layer.client, info.node, ContentKind.File)
        info.node = newNode
        return info
    }

    async createSymbolicLink(parent: Node, name: string, target: string): Promise<SymbolicLinkContentInformation> {
        const directory = this.requireDirectory(parent)
        const layer = directory.layerFor(name)
        const directoryNode = await directory.realizeNode(layer)
        const info = await layer.client.createSymbolicLink(directoryNode, name, target)
        const newNode = await this.nodeMap(directory, name, layer.client, info.node, ContentKind.SymbolicLink)
        info.node = newNode
        return info
    }

    async remove(parent: Node, name: string): Promise<boolean> {
        const directory = this.requireDirectory(parent)
        const [client, clientInfo] = await directory.lookup(name)
        if (clientInfo === undefined) return false
        const result = await directory.remove(name)
        if (result) {
            this.forget(client, clientInfo.node)
        }
        return result
    }

    async setAttributes(node: Node, attributes: EntryAttributes): Promise<ContentInformation> {
        const layerNode = nRequired(this.map.get(node))
        if (layerNode.kind == NodeKind.Client) {
            const info = await layerNode.client.setAttributes(layerNode.node, attributes)
            info.node = node
            return info
        }
        const directory = layerNode.directory
        return directory.setAttributes(node, attributes)
    }

    async rename(parent: Node, name: string, newParent: Node, newName: string): Promise<void> {
        if (name == newName) return
        const parentDirectory = this.requireDirectory(parent)
        const newParentDirectory = this.requireDirectory(newParent)
        parentDirectory.rename(name, newParentDirectory, newName)
    }

    async link(parent: Node, node: Node, name: string): Promise<void> {
        const directory = this.requireDirectory(parent)
        const layer = directory.layerFor(name)
        const directoryNode = await directory.realizeNode(layer)
        const { client, node: clientNode } = this.requireFile(node)
        if (layer.client == client) {
            return layer.client.link(directoryNode, clientNode, name)
        } else {
            const content = await client.content(clientNode)
            await layer.client.createFile(directoryNode, name, content)
        }
    }

    sync(): Promise<void> {
        const directoryNode = nRequired(this.map.get(1))
        const directory = nRequired(directoryNode.kind == NodeKind.Directory ? directoryNode.directory : undefined)
        return directory.sync()
    }

    private async nodeMap(
        parent: LayeredDirectory,
        name: string,
        client: FilesClient,
        clientNode: Node,
        kind?: ContentKind,
        computeKind?: () => Promise<ContentKind>,
    ): Promise<Node> {
        let clientMap = this.invertNodeMap.get(client)
        if (!clientMap) {
            clientMap = new Map()
            this.invertNodeMap.set(client, clientMap)
        }
        let allocatedNode = clientMap.get(clientNode)
        if (allocatedNode === undefined) {
            allocatedNode = this.allocNode()
            clientMap.set(clientNode, allocatedNode)
            if (kind === undefined && computeKind) {
                kind = await computeKind()
            }
            if (kind === undefined) invalid("Invalid call to nodeMap")
            if (kind == ContentKind.Directory) {
                this.map.set(
                    allocatedNode, {
                        kind: NodeKind.Directory,
                        directory: parent.nested(name, client, clientNode)
                    }
                )
            } else {
                this.map.set(
                    allocatedNode,
                    {
                        kind: NodeKind.Client,
                        client,
                        node: clientNode
                     }
                )
            }
        }
        return allocatedNode
    }

    private forget(client: FilesClient, clientNode: Node) {
        let clientMap = this.invertNodeMap.get(client)
        if (clientMap) {
            const allocatedNode = clientMap.get(clientNode)
            if (allocatedNode) {
                this.map.delete(allocatedNode)
                clientMap.delete(clientNode)
                if (clientMap.size == 0) {
                    this.invertNodeMap.delete(client)
                }
            }
        }
    }

    private requireFile(node: Node): ClientNode {
        const layerNode = this.map.get(node)
        if (layerNode && layerNode.kind == NodeKind.Client) {
            return layerNode
        }
        invalid("Node is not a file")
    }

    private requireDirectory(node: Node): LayeredDirectory {
        const layerNode = nRequired(this.map.get(node))
        if (layerNode.kind != NodeKind.Directory) invalid("Node is not a directory");
        return layerNode.directory
    }

    private allocNode(): Node {
        return this.nextNode++
    }
}

function nRequired<T>(value: T | undefined): T {
    if (value) return value
    invalid("Unrecognized node")
}
