import { streamBlob } from "../../common/blob";
import { error } from "../../common/errors";
import { PingableClient } from "../../common/pingable_client";
import { ContentLink } from "../../common/types";
import { Data } from "../../storage/client";
import { ContentInformation, ContentKind, EntryAttriutes, FileDirectoryEntry, FileLayerClient, Node } from "../file_layer_client";

const fileLayerPrefix = '/file-layer'
const mountPrefix = `${fileLayerPrefix}/mount`
const unmountPrefix = `${fileLayerPrefix}/unmount`
const lookupPrefix = `${fileLayerPrefix}/lookup`
const infoPrefix = `${fileLayerPrefix}/info`
const contentPrefix = `${fileLayerPrefix}/content`
const removePrefix = `${fileLayerPrefix}/remove`
const attributesPrefix = `${fileLayerPrefix}/attributes`
const sizePrefix = `${fileLayerPrefix}/size`
const renamePrefix = `${fileLayerPrefix}/rename`
const linkPrefix = `${fileLayerPrefix}/link`

export class FileLayerWebClient extends PingableClient implements FileLayerClient {
    constructor (url: URL) {
        super(url)
    }

    mount(content: ContentLink, executable?: boolean, writable?: boolean): Promise<Node> {
        const url = new URL(mountPrefix)
        if (executable !== undefined) {
            url.searchParams.append('executable', `${executable}`)
        }
        if (writable !== undefined) {
            url.searchParams.append('writable', `${writable}`)
        }
        return this.postJson<number>(content, url)
    }

    unmount(node: Node): Promise<ContentLink> {
        return this.postJson<ContentLink>('', `${unmountPrefix}/:${node}`)
    }

    lookup(parent: Node, name: string): Promise<Node | undefined> {
        return this.getJsonOrUndefined(`${lookupPrefix}/${parent}/${name}`)
    }

    info(node: Node): Promise<ContentInformation | undefined> {
        return this.getJsonOrUndefined(`${infoPrefix}/${node}`)
    }

    content(node: Node): Promise<ContentLink> {
        return this.getJson<ContentLink>(`${contentPrefix}/${node}`)
    }

    async createNode(parent: Node, name: string, kind: ContentKind): Promise<number> {
        const url = new URL(`${fileLayerPrefix}/${parent}`, this.url)
        let headers = { }
        url.searchParams.append('kind', kind)
        const response = await fetch(url, {
            method: 'POST',
            headers
        })
        if (response.ok) {
            return await response.json() as number
        }
        error(`Could not create node: ${response.status}`)
    }

    async *readFile(node: Node, offset?: number, length?: number): Data {
        const url = new URL(`${fileLayerPrefix}/${node}`, this.url)
        if (offset !== undefined) {
            url.searchParams.append('offset', `${offset}`)
        }
        if (length !== undefined) {
            url.searchParams.append('length', `${length}`)
        }
        const response = await fetch(url)
        if (response.ok && response.body) {
            yield *await streamBlob(await response.blob())
        } else {
            error("Could not read file")
        }
    }

    async writeFile(node: Node, data: Data, offset?: number, size?: number, executable?: boolean, writable?: boolean, type?: string | null): Promise<number> {
        const url = new URL(`${fileLayerPrefix}/${node}`, this.url)
        let headers = {}
        if (offset !== undefined) {
            url.searchParams.append('offset', `${offset}`)
        }
        if (size !== undefined) {
            url.searchParams.append('size', `${size}`)
        }
        if (executable !== undefined) {
            url.searchParams.append('executable', `${executable}`)
        }
        if (writable !== undefined) {
            url.searchParams.append('writable', `${writable}`)
        }
        if (type !== undefined) {
            headers = { 'Content-Type': type }
        }
        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: data
        })
        if (response.ok) {
            return await response.json() as number
        }
        error(`Could not write to file: ${response.status}`)
    }

    async setSize(node: Node, size: number): Promise<void> {
        const url = new URL(`${sizePrefix}/${node}`, this.url)
        url.searchParams.append('size', `${size}`)
        const response = await fetch(url, {
            method: 'PUT',
        })
        if (!response.ok) {
            error(`Could not set the size of ${node}: ${response.status}`)
        }
    }

    async *readDirectory(node: Node, offset?: number, length?: number): AsyncIterable<FileDirectoryEntry> {
        const url = new URL(`${fileLayerPrefix}/${node}`, this.url)
        if (offset !== undefined) {
            url.searchParams.append('offset', `${offset}`)
        }
        if (length !== undefined) {
            url.searchParams.append('length', `${length}`)
        }
        yield *await this.getJsonStream<FileDirectoryEntry>(url)
    }

    async removeNode(parent: Node, name: string): Promise<boolean> {
        const url = new URL(`${removePrefix}/${parent}/${name}`, this.url)
        const response = await fetch(url, {
            method: 'POST'
        })
        if (response.ok) {
            return await response.json() as boolean
        }
        error(`Could not remove node: ${response.status}`)
    }

    async setAttributes(node: Node, attributes: EntryAttriutes): Promise<void> {
        const url = new URL(`${attributesPrefix}/${node}`, this.url)
        const response = await fetch(url, {
            method: 'POST',
            body: JSON.stringify(attributes)
        })
        if (!response.ok) {
            error(`Could not set attributes of ${node}`)
        }
    }

    async rename(parent: Node, name: string, newParent: Node, newName: string): Promise<boolean> {
        const url = new URL(`${renamePrefix}/${parent}/${name}`)
        url.searchParams.append("newParent", `${newParent}`)
        url.searchParams.append("newName", newName)
        const response = await fetch(url, {
            method: 'PUT',
            body: ''
        })
        return response.ok
    }

    async link(parent: Node, node: Node, name: string): Promise<boolean> {
        const url = new URL(`${linkPrefix}/${parent}/${name}`)
        url.searchParams.append("node", `${node}`)
        const response = await fetch(url, {
            method: 'PUT',
            body: ''
        })
        return response.ok
    }
}