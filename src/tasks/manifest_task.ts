import { jsonFromData, stringsToData } from "../common/data";
import { jsonStreamToText } from "../common/parseJson";
import { directorySchema } from "../common/schema";
import { ContentLink } from "../common/types";
import { ContentReader, ContentWriter } from "../files/files_client";
import { ProductionsClient } from "../production/production_client";

export const manifestTaskId = '954890cadc9a472e73dd5154f04a6c6920b7aa16f3956032778d8204f7ca4592'

export async function manifestTask(
    content: ContentLink,
    contentReader: ContentReader,
    contentWriter: ContentWriter,
    productions: ProductionsClient
): Promise<ContentLink> {
    const seen = new Set<string>()
    const manifest = await contentWriter.writeContentLink(
        stringsToData(jsonStreamToText(findManifestReferences(content, contentReader, seen)))
    )
    await productions.put(manifestTaskId, content.address, manifest.address)
    return  manifest
}

async function *findManifestReferences(
    content: ContentLink,
    contentReader: ContentReader,
    seen: Set<string>
): AsyncIterable<string> {
    async function *manifestFromDirectory(content: ContentLink): AsyncIterable<string> {
        const id = content.address
        if (seen.has(id)) return
        yield id
        seen.add(id)
        const directory = await jsonFromData(directorySchema, contentReader.readContentLink(content))
        if (directory) {
            for (const entry of directory) {
                switch (entry.kind) {
                    case "File":
                        const fileId = entry.content.address
                        if (!seen.has(fileId)) {
                            yield fileId
                            seen.add(fileId)
                        }
                        break
                    case "Directory":
                        yield *manifestFromDirectory(entry.content as ContentLink)
                        break
                }
            }
        }
    }
    yield *manifestFromDirectory(content)
}
