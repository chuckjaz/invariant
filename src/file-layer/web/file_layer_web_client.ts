import { streamBlob } from "../../common/blob";
import { error } from "../../common/errors";
import { PingableClient } from "../../common/pingable_client";
import { ContentLink } from "../../common/types";
import { Data } from "../../storage/client";
import { ContentInformation, ContentKind, FileDirectoryEntry, FileLayerClient, Node } from "../file_layer_client";

const fileLayerPrefix = '/file-layer'
const mountPrefix = `${fileLayerPrefix}/mount`
const unmountPrefix = `${fileLayerPrefix}/unmount`
const infoPrefix = `${fileLayerPrefix}/info`
const contentPrefix = `${fileLayerPrefix}/content`
const removePrefix = `${fileLayerPrefix}/remove`

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
        return this.getJsonOrUndefined(`${fileLayerPrefix}/${parent}/${name}`)
    }

    info(node: Node): Promise<ContentInformation | undefined> {
        return this.getJsonOrUndefined(`${infoPrefix}/${node}`)
    }

    content(node: Node): Promise<ContentLink> {
        return this.getJson<ContentLink>(`${contentPrefix}/${node}`)
    }

    createNode(parent: Node, name: string, kind: ContentKind.File, executable?: boolean, writable?: boolean, type?: string | null, data?: Data, size?: number): Promise<Node>;
    createNode(parent: Node, name: string, kind: ContentKind.Directory, executable?: boolean, writable?: boolean): Promise<Node>;
    async createNode(parent: Node, name: string, kind: ContentKind, executable?: boolean, writable?: boolean, type?: string, data?: Data, size?: number): Promise<number> {
        const url = new URL(`${fileLayerPrefix}/${parent}`, this.url)
        let headers = {}
        url.searchParams.append('kind', kind)
        if (executable !== undefined) {
            url.searchParams.append('executable', `${executable}`)
        }
        if (writable !== undefined) {
            url.searchParams.append('writable', `${writable}`)
        }
        if (type !== undefined) {
            headers = { 'Content-Type': type }
        }
        if (size !== undefined) {
            url.searchParams.append('size', `${size}`)
        }
        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: data
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

    async remove(parent: Node, name: string): Promise<boolean> {
        const url = new URL(`${removePrefix}/${parent}/${name}`, this.url)
        const response = await fetch(url, {
            method: 'POST'
        })
        if (response.ok) {
            return await response.json() as boolean
        }
        error(`Could not remove node: ${response.status}`)
    }
}