import { CommandModule } from "yargs";
import { ContentLink } from "../common/types";
import { ContentReader } from "../files/files_client";
import { normalizeCode } from "../common/codes";
import { jsonFromData } from "../common/data";
import { contentLinkSchema, directorySchema } from "../common/schema";
import { loadConfiguration } from "../config/config";
import { safeParseJson } from "../common/parseJson";
import { error } from "../common/errors";
import { defaultBroker } from "./common/common_broker";
import { firstDistribute, firstFinder, firstStorage } from "./start";
import { Files } from "../files/files";
import { randomId } from "../common/id";
import { mockSlots } from "../slots/mock/slots_mock_client";
import { BlockFindingStorage } from "../storage/find/storage_find";

export default {
    command: 'pin [content]',
    describe: "Publish a value to a slot",
    builder: yargs => {
        return yargs.positional('content', {
            describe: "The content to pin. This can be a content address object or just the address",
        }).demandOption('content')
    },
    handler: async (argv: any) => { await pin(
        argv.content
    )}
} satisfies CommandModule

async function pin(contentOrAddress: string) {
    const effectiveAddress = normalizeCode(contentOrAddress)
    const effectiveContent = effectiveAddress? { address: effectiveAddress } :
        contentLinkSchema.parse(safeParseJson(contentOrAddress)) as (ContentLink | undefined);
    if (!effectiveContent) {
        error("Unexpected format for content")
    }
    const config = await loadConfiguration()
    const broker = await defaultBroker(config)
    const finder = await firstFinder(broker)
    const backingStorage = await firstStorage(broker)
    if (!backingStorage) error("Storage is required");
    const storage = finder ? new BlockFindingStorage(broker, finder, backingStorage) : backingStorage
    const slots = mockSlots()
    const reader = new Files(randomId(), storage, slots, broker)
    const distribute = await firstDistribute(broker)
    if (!distribute) error("Could not find a distribute service");
    await distribute.pin(findManifestReferences(effectiveContent, reader, new Set()))
}

async function *findManifestReferences(
    content: ContentLink,
    contentReader: ContentReader,
    seen: Set<string>
): AsyncIterable<string> {
    async function *manifestFromDirectory(content: ContentLink): AsyncIterable<string> {
        const id = content.address
        if (seen.has(id)) return
        seen.add(id)
        yield id
        const directory = await jsonFromData(directorySchema, contentReader.readContentLink(content))
        if (directory) {
            for (const entry of directory) {
                switch (entry.kind) {
                    case "File":
                        const fileId = entry.content.address
                        if (!seen.has(fileId)) {
                            seen.add(fileId)
                            yield fileId
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
