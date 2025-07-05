import { CommandModule } from "yargs";
import { loadConfiguration } from "../../config/config";
import { defaultBroker } from "../common/common_broker";
import { defaultSlots, defaultStorage } from "../start";
import { ContentLink } from "../../common/types";
import { invalid } from "../../common/errors";
import { Files } from "../../files/files";
import { randomId } from "../../common/id";
import { resolveId } from "../common/common_resolve";
import { stringsToData } from "../../common/data";
import { Commit, commitToData } from "../../workspace/repository";

export default {
    command: 'init',
    describe: 'Create (or update) a slot to be a development branch',
    builder: yargs => {
        return yargs
            .option('slot', {
                describe: "The slot to update. By default, a new slot will be created",
                alias: "s",
            })
            .option('content', {
                describe: "The content of the initial commit. By default it will be an empty directory",
                alias: "c",
            })
            .option('message', {
                describe: "The initial message for the commit. By default it will be `Initial commit`",
                alias: "m",
            })
    },
    handler: async (args: any) => { await initCommand(args.slot, args.content, args.message) }
} as CommandModule

async function initCommand(slot?: string, content?: string, message?: string) {
    const config = await loadConfiguration()
    const broker = await defaultBroker(config)
    const storage = await defaultStorage(broker)
    const slots = await defaultSlots(broker)
    const options = config.options ?? {}
    const userName = options["user.name"];
    if (!userName) invalid("A 'user.name' option must be specified in the configuration");
    const userEmail = options["user.email"];
    if (!userEmail) invalid("A 'user.email' option must be specified in the configuration");

    const files = new Files(randomId(), storage, slots, broker)
    try {
        // Create the initial commit message
        let contentLink: ContentLink
        if (content) {
            const resolvedLink = await resolveId(broker, content)
            if (!resolvedLink) invalid(`Could not resolve ${content}`)
            contentLink = resolvedLink
        } else {
            // Create an empty directory to use as the content link
            contentLink = await files.writeContentLink(stringsToData("[]"))
        }
        const author = `${userName} <${userEmail}>`
        const commit: Commit = {
            date: new Date().toUTCString(),
            author,
            committer: author,
            message: message ?? 'Initial commit',
            content: contentLink,
            parents: []
        }
        const commitLink = await files.writeContentLink(commitToData(commit))

        // Create the slot
        let slotLink: ContentLink
        if (slot) {
            const resolvedLink = await resolveId(broker, slot)
            if (!resolvedLink) invalid(`Could not resolve ${slot}`);
            if (!resolvedLink.slot) invalid(`${slot} does not refer to a slot`);
            slotLink = resolvedLink

            const current = await slots.get(resolvedLink.address)
            if (!current) invalid(`Could not find slot ${slot}`);
            const result = await slots.put(resolvedLink.address, {
                previous: current.address,
                address: commitLink.address
            })
            if (!result) invalid(`Could not update the slot: ${slot}`)
        } else {
            const slotId = randomId()
            const result = await slots.register({
                id: slotId,
                address: commitLink.address
            })
            if (!result) invalid("Could not create a slot");
            slotLink = toSlotLink(contentLink, slotId)
        }

        // Report the new branch.
        console.log(`BRANCH: ${JSON.stringify(slotLink)}`)
    } finally {
        files.stop()
    }

}

function toSlotLink(contentLink: ContentLink, slotId: string): ContentLink {
    const { address, slot, ...rest } = contentLink
    return { ...rest, address: slotId, slot: true }
}