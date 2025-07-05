import { CommandModule } from "yargs";
import { invalid } from "../../common/errors";
import { loadConfiguration } from "../../config/config";
import { defaultBroker } from "../common/common_broker";
import { defaultSlots, defaultStorage } from "../start";
import { Files } from "../../files/files";
import { randomId } from "../../common/id";
import { resolveId } from "../common/common_resolve";
import { ContentLink } from "../../common/types";
import { commitFromData } from "../../workspace/repository";
import { SlotsClient } from "../../slots/slot_client";

export default {
    command: 'log [branch]',
    describe: 'Print a log of the changes of the given branch',
    builder: yargs => {
        return yargs
            .option('branch', {
                describe: "A slot reference to the branch for which to produce a log",
                alias: "b",
            })
    },
    handler: async (args: any) => { await logCommand(args.branch) }
} as CommandModule


async function logCommand(branch?: string) {
    if (!branch) invalid("A branch is currently required");
    const config = await loadConfiguration()
    const broker = await defaultBroker(config)
    const storage = await defaultStorage(broker)
    const slots = await defaultSlots(broker)
    const files = new Files(randomId(), storage, slots, broker)

    const branchLink = await resolveId(broker, branch, true)
    if (!branchLink) invalid(`Could not resolve ${branch} to a branch`);
    const resolvedBranchLink = await resolveContent(branchLink, slots)
    await emit(resolvedBranchLink)

    async function emit(content: ContentLink) {
        const commit = await commitFromData(files.readContentLink(content))
        const localDate = new Date(Date.parse(commit.date))
        console.log(`commit  ${content.address}`)
        console.log(`Author: ${commit.author}`)
        console.log(`Date:   ${localDate.toLocaleString()}`)
        console.log()
        console.log(`  ${commit.message.replace('\n', '\n   ')}`)
        console.log()

        for (const parent of commit.parents) {
            await emit(parent)
        }
    }
}

async function resolveContent(content: ContentLink, slots: SlotsClient): Promise<ContentLink> {
    if (content.slot) {
        const slot = await slots.get(content.address);
        if (!slot) throw new Error(`Slot ${content.address} not found`);
        const { address, slot: _, ...rest } = content
        return { address: slot.address, ...rest };
    }
    return content;
}

