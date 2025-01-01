import * as path from 'path'
import ignore, { Ignore } from "ignore";
import { ContentLink } from "../../common/types";
import { Data, StorageClient } from "../../storage/storage_client";
import { Node, ContentInformation, FileDirectoryEntry, ContentKind, EntryAttributes, FilesClient } from "../files_client";
import { jsonFromData } from '../../common/data';
import z from 'zod';
import { contentLinkSchema } from '../../common/schema';
import { Files } from '../files';
import { SlotsClient } from '../../slots/slot_client';
import { BrokerClient } from '../../broker/broker_client';
import { dataToString } from '../../common/parseJson';
import { invalid } from '../../common/errors';

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
            predicate: name => !ignore.ignores(path.join(directory, name)),
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
            predicate: name => accept.ignores(path.join(directory, name)),
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

interface ClientNode {
    client: FilesClient
    node: number
}

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

    layerFor(name: string): FileLayer {
        const [layer] = this.select(name)
        return layer
    }

    async lookup(name: string): Promise<[FilesClient, Node | undefined]> {
        const [layer, index] = this.select(name)
        let parent = await this.findDirectoryNode(layer.client, index)
        if (parent === undefined) return [layer.client, undefined]
        const node = await layer.client.lookup(parent, name)
        return [layer.client, node]
    }

    nested(name: string, client: FilesClient, node: Node): LayeredDirectory {
        const nestedLayers = this.fileLayers.map(layer => layer.layerFor(name, client, node))
        return new LayeredDirectory(nestedLayers, name, this)
    }

    async *readDirectory(): AsyncIterable<[string, ClientNode, ContentKind]> {
        const sent = new Set<string>()
        let index = 0
        for (const layer of this.fileLayers) {
            const client = layer.client
            const parent = await this.findDirectoryNode(client, index++)
            if (parent === undefined) continue;
            for await (const entry of client.readDirectory(parent)) {
                if (sent.has(entry.name)) continue;
                sent.add(entry.name)
                yield [entry.name, { client, node: entry.node }, entry.kind ]
            }
        }
    }

    async findDirectoryNode(client: FilesClient, index: number): Promise<Node | undefined> {
        const layer = this.fileLayers[index]
        let directoryNode = layer.node
        if (directoryNode === undefined) {
            const parent = await nRequired(this.parent).findDirectoryNode(client, index)
            if (parent == undefined) return undefined;
            const newDirectoryNode = await client.lookup(parent, this.name)
            if (newDirectoryNode === undefined) return undefined;
            layer.node = newDirectoryNode
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
        const directoryNode = await client.lookup(parent, this.name)
        if (directoryNode === undefined) {
            const realizedNode = await client.createNode(parent, this.name, ContentKind.Directory)
            return realizedNode
        }
        return directoryNode
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
        for (const layer of this.fileLayers) {
            if (clients.has(layer.client)) continue;
            clients.add(layer.client)
            await layer.client.sync()
        }
    }
}

const defaultFrequency = 10 * 1000

export class LayeredFiles implements FilesClient {
    private controlPlane: FilesClient
    private storage: StorageClient
    private slots: SlotsClient
    private broker: BrokerClient
    private nextNode = 1
    private nodeMap = new Map<Node, ClientNode>()
    private invertNodeMap = new Map<FilesClient, Map<Node, Node>>()
    private directories = new Map<Node, LayeredDirectory>()

    constructor (
        controlPlane: FilesClient,
        storage: StorageClient,
        slots: SlotsClient,
        broker: BrokerClient
    ) {
        this.controlPlane = controlPlane
        this.storage = storage
        this.slots = slots
        this.broker = broker
    }

    async mount(content: ContentLink): Promise<Node> {
        // `content` should be a link to a control plane which is a directory that contains the
        // layer description in a `.layers` file. The `.layers` file is the only file that
        // is used from this layer though other may be added in the future.
        const controlPlane = this.controlPlane
        const controlNode = await controlPlane.mount(content)

        const layerNode = await controlPlane.lookup(controlNode, '.layers')
        if (layerNode === undefined) invalid("Invalid control plain, does not contain a .layer file");
        const layerDescriptions = await jsonFromData(fileLayerDescriptionsSchema, controlPlane.readFile(layerNode))
        if (layerDescriptions == undefined) invalid("Incorrect layer schema");

        const rootNode = this.allocNode()

        // Create and mount the layers from the specification
        const fileLayers: FileLayer[] = []
        for (const layerDescription of layerDescriptions) {
            let client: FilesClient
            let layerRoot: Node
            if (layerDescription.content == "Self") {
                client = controlPlane
                layerRoot = controlNode
            } else {
                client = new Files(
                    this.storage,
                    this.slots,
                    this.broker,
                    layerDescription.syncFrequency ?? defaultFrequency
                )
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
                            const ignoreNode = await client.lookup(layerRoot, ignoreFile)
                            if (ignoreNode === undefined) continue;
                            const ignoreText = await dataToString(client.readFile(ignoreNode))
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
        this.directories.set(rootNode, directory)
        return rootNode
    }

    unmount(node: Node): Promise<ContentLink> {
        invalid("Cannot unmount layered files")
    }

    async lookup(parent: Node, name: string): Promise<Node | undefined> {
        const directory = nRequired(this.directories.get(parent))
        const [client, clientNode] = await directory.lookup(name)
        if (clientNode !== undefined) {
            const node = this.mapNode(client, clientNode)
            const info = await client.info(clientNode)
            if (info && info.kind == ContentKind.Directory) {
                this.ensureDirectory(directory, node, name, client, clientNode)
            }
            return node
        }
        return undefined
    }

    info(node: Node): Promise<ContentInformation | undefined> {
        const { client, node: clientNode } = nRequired(this.nodeMap.get(node))
        return client.info(clientNode)
    }

    content(node: Node): Promise<ContentLink> {
        const { client, node: clientNode } = nRequired(this.nodeMap.get(node))
        return client.content(clientNode)
    }

    readFile(node: Node, offset?: number, length?: number): Data {
        const { client, node: clientNode } = nRequired(this.nodeMap.get(node))
        return client.readFile(clientNode, offset, length)
    }

    writeFile(node: Node, data: Data, offset?: number, length?: number): Promise<number> {
        const { client, node: clientNode } = nRequired(this.nodeMap.get(node))
        return client.writeFile(clientNode, data, offset, length)
    }

    setSize(node: Node, size: number): Promise<void> {
        const { client, node: clientNode } = nRequired(this.nodeMap.get(node))
        return client.setSize(clientNode, size)
    }

    async *readDirectory(parent: Node, offset?: number, length?: number): AsyncIterable<FileDirectoryEntry> {
        const directory = nRequired(this.directories.get(parent))
        let start = offset ?? 0
        let end = start + (length ?? Number.MAX_SAFE_INTEGER)
        let index = 0
        for await (const [name, {client, node: clientNode}, kind] of directory.readDirectory()) {
            const node = this.mapNode(client, clientNode)
            if (kind == ContentKind.Directory) {
                this.ensureDirectory(directory, node, name, client, clientNode)
            }
            if (index >= start) yield { name, node, kind };
            index++
            if (index >= end) break
        }
    }

    async createNode(parent: Node, name: string, kind: ContentKind): Promise<Node> {
        const directory = nRequired(this.directories.get(parent))
        const layer = directory.layerFor(name + (kind == ContentKind.Directory ? '/' : ''))
        const directoryNode = await directory.realizeNode(layer)
        const clientNode = await layer.client.createNode(directoryNode, name, kind)
        const node = this.mapNode(layer.client, clientNode)
        if (kind == ContentKind.Directory) {
            this.ensureDirectory(directory, node, name, layer.client, clientNode)
        }
        return node
    }

    async removeNode(parent: Node, name: string): Promise<boolean> {
        const { client, node: clientParent } = nRequired(this.nodeMap.get(parent))
        const clientNode = await client.lookup(clientParent, name)
        if (clientNode === undefined) return false
        const info = await client.info(clientNode)
        if (info == undefined) return false
        const node = this.mapNode(client, clientNode)
        if (await client.removeNode(clientParent, name)) {
            this.forget(client, clientNode, node)
            if (info.kind == ContentKind.Directory) {
                this.directories.delete(node)
            }
            return true
        }
        return false
    }

    setAttributes(node: Node, attributes: EntryAttributes): Promise<void> {
        const { client, node: clientNode } = nRequired(this.nodeMap.get(node))
        return client.setAttributes(clientNode, attributes)
    }

    rename(parent: Node, name: string, newParent: Node, newName: string): Promise<boolean> {
        const { node: clientParentNode, client } = nRequired(this.nodeMap.get(parent) )
        const { node: clientNewParentNode, client: newParentClient } = nRequired(this.nodeMap.get(newParent))
        if (client != newParentClient) {
            invalid("Cannot rename across layers")
        }
        const newParentDirectory = nRequired(this.directories.get(newParent))
        const newLayer = newParentDirectory.layerFor(newName)
        if (newLayer.client != client) {
            invalid("Cannot rename across layers")
        }
        return client.rename(clientParentNode, name, clientNewParentNode, newName)
    }

    link(parent: Node, node: Node, name: string): Promise<boolean> {
        const { client, node: clientParent } = nRequired(this.nodeMap.get(parent))
        const { node: clientNode} = nRequired(this.nodeMap.get(node))
        const directory = nRequired(this.directories.get(parent))
        const newLayer = directory.layerFor(name)
        if (newLayer.client != client) {
            invalid("Cannot link across layers")
        }
        return client.link(clientParent, clientNode, name)
    }

    sync(): Promise<void> {
        const directory = nRequired(this.directories.get(1))
        return directory.sync()
    }

    private mapNode(client: FilesClient, clientNode: Node): Node {
        let clientMap = this.invertNodeMap.get(client)
        if (!clientMap) {
            clientMap = new Map()
            this.invertNodeMap.set(client, clientMap)
        }
        let allocatedNode = clientMap.get(clientNode)
        if (allocatedNode === undefined) {
            allocatedNode = this.allocNode()
            clientMap.set(clientNode, allocatedNode)
            this.nodeMap.set(allocatedNode, { client, node: clientNode })
        }
        return allocatedNode
    }

    private forget(client: FilesClient, clientNode: Node, allocatedNode: Node) {
        this.nodeMap.delete(allocatedNode)
        let clientMap = this.invertNodeMap.get(client)
        if (clientMap) {
            clientMap.delete(clientNode)
        }
    }

    private ensureDirectory(
        parent: LayeredDirectory,
        node: Node,
        name: string,
        filesClient: FilesClient,
        clientNode: Node
    ) {
        if (this.directories.has(node)) return;
        this.directories.set(node, parent.nested(name, filesClient, clientNode))
    }

    private allocNode(): Node {
        return this.nextNode++
    }
}

function nRequired<T>(value: T | undefined): T {
    if (value) return value
    invalid("Unrecognized node")
}
