import z from "zod"
import { jsonFromData } from "../common/data"
import { ParallelContext } from "../common/parallel_context"
import { dataFromString, dataToString, jsonStream } from "../common/parseJson"
import { ContentLink, Entry, EntryKind } from "../common/types"
import { ContentReader, ContentWriter } from "../files/files_client"
import { ProductionsClient } from "../productions/productions_client"
import { Converter } from 'showdown'
import showdownHighlight from "showdown-highlight"
import { contentLinkSchema, directorySchema } from "../common/schema"
import { invalid } from "../common/errors"
import { Spec, textToSpec } from "../common/specs"
import { stringCompare } from "../common/compares"

export const markdownFileTaskId = "67a9fcaea2ab80cc70b2773ebe07a884770188bd9739c7ff3ba55cad16008e50"
export const markdownDirectoryTaskId = "6951df63479cda36a23c2aecaf324d66149e46d3b30268e8ed47c4abfae90277"

export async function markdownFileTask(
    content: ContentLink,
    contentReader: ContentReader,
    contentWriter: ContentWriter,
    productions: ProductionsClient
): Promise<ContentLink> {
    const text = await dataToString(contentReader.readContentLink(content))
    const converter = new Converter({
        extensions: [showdownHighlight({
            pre: true,
            auto_detection: true
        })]
    })
    const result = converter.makeHtml(text)
    const data = dataFromString(result)
    const output = await contentWriter.writeContentLink(data)
    await productions.put(markdownFileTaskId, content.address, output.address)
    return output
}

export interface MarkdownDirectoryRequest {
    directory: ContentLink
    specs?: string[]
}

const requestSchema = z.object({
    directory: contentLinkSchema,
    specs: z.optional(z.array(z.string()))
})

async function *fileRequests(
    contentReader: ContentReader,
    content: ContentLink,
    specs: Spec[]
): AsyncIterable<{ entry: Entry, output: string }> {
    const directory = await jsonFromData(
        directorySchema,
        contentReader.readContentLink(content)
    ) as Entry[]
    if (!directory) invalid("Could not read directory");
    for (const entry of directory) {
        switch (entry.kind) {
            case EntryKind.File: {
                for (const spec of specs) {
                    const output = spec(entry.name)
                    if (output) {
                        yield { entry, output }
                        break
                    }
                }
                break
            }
            case EntryKind.Directory: {
                yield { entry, output: entry.name }
                break
            }
        }
    }
}

export async function markdownDirectoryTask(
    content: ContentLink,
    contentReader: ContentReader,
    contentWriter: ContentWriter,
    productions: ProductionsClient,
    context: ParallelContext
): Promise<ContentLink> {
    const request = await jsonFromData(
        requestSchema,
        contentReader.readContentLink(content)
    )
    if (!request) invalid("Could not read the request");

    const specs = (request.specs ?? ["(.*)\\.(md|markdown),$1.html"]).map(spec => textToSpec(spec))

    async function convertDirectory(content: ContentLink): Promise<ContentLink | undefined> {
        const entryPromises: Promise<Entry | undefined>[] = []
        for await (const request of fileRequests(contentReader, content, specs)) {
            switch (request.entry.kind) {
                case EntryKind.File: {
                    entryPromises.push(context.run(async () => {
                        const content = await markdownFileTask(
                            request.entry.content,
                            contentReader,
                            contentWriter,
                            productions
                        )
                        return {
                            name: request.output,
                            kind: EntryKind.File,
                            content
                        }
                    }))
                    break
                }
                case EntryKind.Directory: {
                    entryPromises.push(context.run(async () => {
                        const content = await convertDirectory(request.entry.content)
                        if (content) {
                            return {
                                name: request.output,
                                kind: EntryKind.Directory,
                                content
                            }
                        } else return undefined
                    }))
                }
            }
        }
        const entries = (await Promise.all(entryPromises)).filter(entry => entry != undefined)
        if (entries.length) {
            entries.sort((a, b) => stringCompare(a.name, b.name) )
            const text = JSON.stringify(entries)
            return await contentWriter.writeContentLink(dataFromString(text))
        } else {
            return undefined
        }
    }

    const directoryContent = await convertDirectory(request.directory as ContentLink)
    if (directoryContent) {
        return directoryContent
    }
    return await contentWriter.writeContentLink(dataFromString("[]"))
}
