import { CommandModule } from "yargs";
import { directoryExists } from "../../common/files";
import { error } from "../../common/errors";

import { determineId } from "./idUtil";
import { addServer } from "./serverUtil";

export default {
    command: "storage [directory]",
    describe: "Add a local storage server to the Invariant configuration",
    builder: yargs =>
        yargs
            .positional('directory', {
                describe: "The local directory to use to store files"
            })
            .option('id', {
                describe: "The id of the storage server [defaults to a new id]"
            })
            .demandOption('directory'),
    handler: async (args: any) => {
        await addStorage(args.directory, args.id)
     }
} satisfies CommandModule

async function addStorage(directory: string, id?: string) {
    if (!directoryExists(directory)) {
        error(`The directory "${directory}" does not exist`)
    }

    id = await determineId(id, directory)

    await addServer({
        server: "storage",
        id,
        directory
    })
}
