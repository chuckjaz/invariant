import { streamBlob } from "../../common/blob";
import { error } from "../../common/errors";
import { PingableClient } from "../../common/pingable_client";
import { ContentLink } from "../../common/types";
import { Data } from "../../storage/storage_client";
import { ContentInformation, ContentKind, DirectoryContentInformation, EntryAttributes, FileContentInformation, FileDirectoryEntry, FilesClient, Node, SymbolicLinkContentInformation } from "../files_client";

const filesPrefix = '/files'
const mountPrefix = `${filesPrefix}/mount`
const unmountPrefix = `${filesPrefix}/unmount`
const lookupPrefix = `${filesPrefix}/lookup`
const infoPrefix = `${filesPrefix}/info`
const contentPrefix = `${filesPrefix}/content`
const removePrefix = `${filesPrefix}/remove`
const attributesPrefix = `${filesPrefix}/attributes`
const sizePrefix = `${filesPrefix}/size`
const renamePrefix = `${filesPrefix}/rename`
const linkPrefix = `${filesPrefix}/link`
const syncPrefix = `${filesPrefix}/sync`

export class FilesWebClient extends PingableClient implements FilesClient {
    constructor (url: URL) {
        super(url)
    }

    mount(content: ContentLink, executable?: boolean, writable?: boolean): Promise<Node> {
        const url = new URL(mountPrefix, this.url)
        if (executable !== undefined) {
            url.searchParams.append('executable', `${executable}`)
        }
        if (writable !== undefined) {
            url.searchParams.append('writable', `${writable}`)
        }
        return this.postJson<number>(content, url)
    }

    unmount(node: Node): Promise<ContentLink> {
        return this.postJson<ContentLink>('', `${unmountPrefix}/${node}`)
    }

    lookup(parent: Node, name: string): Promise<ContentInformation | undefined> {
        return this.getJsonOrUndefined(`${lookupPrefix}/${parent}/${name}`)
    }

    info(node: Node): Promise<ContentInformation> {
        return this.getJson(`${infoPrefix}/${node}`)
    }

    content(node: Node): Promise<ContentLink> {
        return this.getJson<ContentLink>(`${contentPrefix}/${node}`)
    }

    async createDirectory(
        parent: Node,
        name: string,
        content?: ContentLink
    ): Promise<DirectoryContentInformation> {
        const url = new URL(`${filesPrefix}/${parent}/${name}`, this.url)
        let headers = { }
        url.searchParams.append('kind', ContentKind.Directory)
        if (content) {
            url.searchParams.append('content', JSON.stringify(content))
        }
        const response = await fetch(url, {
            method: 'PUT',
            headers
        })
        if (response.ok) {
            return await response.json() as DirectoryContentInformation
        }
        error(`Could not create directory: ${response.status}`)
    }

    async createFile(
        parent: Node,
        name: string,
        content?: ContentLink
    ): Promise<FileContentInformation> {
        const url = new URL(`${filesPrefix}/${parent}/${name}`, this.url)
        let headers = { }
        url.searchParams.append('kind', ContentKind.File)
        if (content) {
            url.searchParams.append('content', JSON.stringify(content))
        }
        const response = await fetch(url, {
            method: 'PUT',
            headers
        })
        if (response.ok) {
            return await response.json() as FileContentInformation
        }
        error(`Could not create file: ${response.status}`)
    }

    async createSymbolicLink(
        parent: Node,
        name: string,
        target: string
    ): Promise<SymbolicLinkContentInformation> {
        const url = new URL(`${filesPrefix}/${parent}/${name}`, this.url)
        let headers = { }
        url.searchParams.append('kind', ContentKind.SymbolicLink)
        url.searchParams.append('target', target)
        const response = await fetch(url, {
            method: 'PUT',
            headers
        })
        if (response.ok) {
            return await response.json() as SymbolicLinkContentInformation
        }
        error(`Could not create file: ${response.status}`)
    }

    async *readFile(node: Node, offset?: number, length?: number): Data {
        const url = new URL(`${filesPrefix}/${node}`, this.url)
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
        const url = new URL(`${filesPrefix}/${node}`, this.url)
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
            duplex: 'half',
            body: data
        })
        if (response.ok) {
            return await response.json() as number
        }
        error(`Could not write to file: ${response.status}`)
    }

    async setSize(node: Node, size: number): Promise<ContentInformation> {
        const url = new URL(`${sizePrefix}/${node}`, this.url)
        url.searchParams.append('size', `${size}`)
        const response = await fetch(url, {
            method: 'PUT',
        })
        if (response.ok) {
            return await response.json() as ContentInformation
        }
        error(`Could not set the size of node ${node}: ${response.status}`)
    }

    async *readDirectory(node: Node, offset?: number, length?: number): AsyncIterable<FileDirectoryEntry> {
        const url = new URL(`${filesPrefix}/directory/${node}`, this.url)
        if (offset !== undefined) {
            url.searchParams.append('offset', `${offset}`)
        }
        if (length !== undefined) {
            url.searchParams.append('length', `${length}`)
        }
        yield *this.getJsonStream<FileDirectoryEntry>(url)
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

    async setAttributes(node: Node, attributes: EntryAttributes): Promise<ContentInformation> {
        const url = new URL(`${attributesPrefix}/${node}`, this.url)
        const response = await fetch(url, {
            method: 'PUT',
            body: JSON.stringify(attributes)
        })
        if (response.ok) {
            return await response.json() as ContentInformation
        }
        error(`Could not set attributes of ${node}: status: ${response.status}`)
    }

    async rename(parent: Node, name: string, newParent: Node, newName: string): Promise<void> {
        const url = new URL(`${renamePrefix}/${parent}/${name}`, this.url)
        url.searchParams.append("newParent", `${newParent}`)
        url.searchParams.append("newName", newName)
        const response = await fetch(url, {
            method: 'PUT',
            body: ''
        })
        if (!response.ok) {
            error(`Rename failed: status: ${response.status}`)
        }
    }

    async link(parent: Node, node: Node, name: string): Promise<void> {
        const url = new URL(`${linkPrefix}/${parent}/${name}`, this.url)
        url.searchParams.append("node", `${node}`)
        const response = await fetch(url, {
            method: 'PUT',
            body: ''
        })
        if (!response.ok) {
            error(`Link failed: status: ${response.status}`)
        }
    }


    async sync(): Promise<void> {
        const url = new URL(syncPrefix, this.url)
        const response = await fetch(url, {
            method: 'PUT',
            body: ''
        })
    }
}