import { Converter } from "showdown"
import { mockBroker } from "../broker/mock/mock_broker_client"
import { jsonFromData } from "../common/data"
import { error } from "../common/errors"
import { dataFromString, dataToString } from "../common/parseJson"
import { directorySchema } from "../common/schema"
import { ContentLink, DirectoryEntry, Entry, EntryKind, FileEntry } from "../common/types"
import { Files } from "../files/files"
import { findServer } from "../find/server"
import { mockProductions } from "../productions/mock/mock_productions"
import { mockSlots } from "../slots/mock/slots_mock_client"
import { mockStorage } from "../storage/mock"
import { StorageClient } from "../storage/storage_client"
import { markdownDirectoryTask, markdownFileTask } from "./markdown_task"
import showdownHighlight from "showdown-highlight"
import { stringCompare } from "../common/compares"
import { ParallelContext } from "../common/parallel_context"

describe("tasks/markdown task", () => {
    it("can convert a file", async () => {
        const broker = mockBroker()
        const storage = mockStorage(broker)
        await broker.registerStorage(storage)
        const finder = await findServer(broker)
        await broker.registerFind(finder)
        const slots = mockSlots()
        await broker.registerSlots(slots)
        const files = new Files(storage, slots, broker)
        const productions = mockProductions()

        const { content: markdownContent, expect: html } = await createMarkdownFile("# This is a test", storage)
        const htmlContent = await markdownFileTask(markdownContent, files, files, productions)
        const htmlText = await dataToString(files.readContentLink(htmlContent))
        expect(htmlText).toEqual(html)
    })
    it("can convert a directory of files", async () => {
        const broker = mockBroker()
        const storage = mockStorage(broker)
        await broker.registerStorage(storage)
        const finder = await findServer(broker)
        await broker.registerFind(finder)
        const slots = mockSlots()
        await broker.registerSlots(slots)
        const files = new Files(storage, slots, broker)
        const productions = mockProductions()
        const context = new ParallelContext()

        function markdownText(index: number): string {
            return `# This is a test: ${index}`
        }

        const { content, expects: html } = await createMarkdownDirectory(3, 4, markdownText, storage)
        const request = await createMarkdownDirectoryRequest(content, files)
        const directory = await markdownDirectoryTask(request, files, files, productions, context)

        await validate(files, directory, html)
    })
})

async function createMarkdownFile(text: string, storage: StorageClient): Promise<{ content: ContentLink, expect: string }> {
    const converter = new Converter({
        extensions: [showdownHighlight({
            pre: true,
            auto_detection: true
        })]
    })
    const expect = converter.makeHtml(text)
    const address = await storage.post(dataFromString(text))
    if (!address) error("Could not write file");
    return { content: { address }, expect }
}

async function createMarkdownDirectory(level: number, width: number, markdownText: (i: number) => string, storage: StorageClient): Promise<{ content: ContentLink, expects: string[]}> {
    let f = 0
    let d = 0
    const expects: string[] = []

    async function createFile(): Promise<ContentLink> {
        const text = markdownText(f++)
        const { content, expect } = await createMarkdownFile(text, storage)
        expects.push(expect)
        return content
    }

    async function createDirectory(l: number): Promise<ContentLink> {
        const entries: Entry[] = []
        for (let i = 0; i < width; i++) {
            entries.push({
                kind: EntryKind.File,
                name: `f${f}.md`,
                content: await createFile()
            })
        }

        if (l < level) {
            for (let i = 0; i < width; i++) {
                entries.push({
                    kind: EntryKind.Directory,
                    name: `d${d++}`,
                    content: await createDirectory(l + 1)
                })
            }
        }

        entries.sort((a, b) => stringCompare(a.name, b.name))
        const address = await storage.post(dataFromString(JSON.stringify(entries)))
        if (!address) error("Could not write directory");
        return { address }
    }

    const content = await createDirectory(0)
    return { content, expects }
}

function createMarkdownDirectoryRequest(directory: ContentLink, files: Files): Promise<ContentLink> {
    const request = {
        directory
    }
    return files.writeContentLink(dataFromString(JSON.stringify(request)))
}

async function validate(files: Files, content: ContentLink, html: string[]) {

    async function validateFile(entry: FileEntry) {
        const match = entry.name.match(/^f(\d+)\.html$/)
        if (!match) error(`Unexpected name: ${entry.name}`);
        const index = parseInt(match[1])
        const text = await dataToString(files.readContentLink(entry.content))
        expect(text).toEqual(html[index])
    }

    async function validateDirectory(content: ContentLink) {
        const entries = await jsonFromData(directorySchema, files.readContentLink(content)) as Entry[]
        for (const entry of entries) {
            switch (entry.kind) {
                case EntryKind.Directory:
                    await validateDirectory(entry.content)
                    break
                case EntryKind.File:
                    await validateFile(entry)
            }
        }
    }

    await validateDirectory(content)
}