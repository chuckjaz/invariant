import { CommandModule } from "yargs";
import { loadConfiguration } from "../../config/config";
import { defaultBroker } from "../common/common_broker";
import { createWorkspace } from "../../workspace/workspaces";
import { firstSlots, firstStorage } from "../start";
import { Files } from "../../files/files";
import { randomId } from "../../common/id";
import { invalid } from "../../common/errors";
import { mount } from "../mount";

export default {
    command: 'create [branch] [directory]',
    describe: 'Create a workspace',
    builder: yargs => {
        return yargs
            .positional('branch', {
                describe: "The branch to clone [name|content link|slot id]",
                demandOption: "A branch must be specified"
            })
            .positional('directory', {
                describe: 'The directory to mount the files into. Creates the directory if it is missing'

            })
            .option('debug', {
                describe: 'Turns on debug logs for the mount',
                alias: 'd',
                boolean: true
            })
    },
    handler: async (args: any) => { await createWorkspaceCommand(args.branch, args.directory, args.debug) }
} as CommandModule

async function createWorkspaceCommand(branch: string, directory?: string, debug?: boolean) {
    const config = await loadConfiguration()
    const broker = await  defaultBroker(config)
    const slots = await firstSlots(broker)
    if (!slots) invalid("Cannot find a slots service")
    const storage = await firstStorage(broker)
    if (!storage) invalid("Cannot find a storage service")
    const files = new Files(randomId(), storage, slots, broker)

    const link = await createWorkspace(branch, slots, files, files, broker)
    const linkText = JSON.stringify(link)
    console.log(`Workspace: ${JSON.stringify(link)}`)

    if (directory) {
        await mount(linkText, directory, debug ?? false)
    }
}