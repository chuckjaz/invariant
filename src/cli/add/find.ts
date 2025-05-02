import { CommandModule } from "yargs";
import { determineId } from "./idUtil";
import { loadConfiguration } from "../../config/config";

import path from 'node:path'
import fs from 'node:fs/promises'
import { directoryExists } from "../../common/files";
import { addServer } from "./serverUtil";
import { error } from "../../common/errors";

export default {
    command: 'find [directory]',
    describe: 'Add a find server to the configuration',
    builder: yargs => {
        return yargs
            .positional('directory', {
                describe: 'The directory to store the find state [defaults to .invariant/find]'
            })
            .option('id', {
                describe: "The id of the storage server [defaults to a new id]"
            })
            .option('mkdir', {
                describe: "Make the directory if it doesn't already exist",
                boolean: true,
                alias: 'm'
            })
    },
    handler: async (args: any) => { await addFind(args.directory, args.id, args.mkdir) }
} as CommandModule

async function addFind(directory?: string, id?: string, mkdir?: boolean) {
    directory = directory ?? 'find'

    const configuration = await loadConfiguration()
    const actualDirectory = path.resolve(configuration.configPath, directory)
    if (!await directoryExists(actualDirectory)) {
        if (mkdir) {
            await fs.mkdir(actualDirectory, { recursive: true })
        } else {
            error(`Directory ${actualDirectory} does not exist`)
        }
    }

    id = await determineId(id, actualDirectory)

    await addServer({
        server: 'find',
        id,
        directory
    })
}