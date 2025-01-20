import { CommandModule } from "yargs";
import { normalizeCode } from "../common/codes";
import { invalid } from "../common/errors";
import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import { directoryExists } from "../common/files";
import { loadConfiguration } from "../config/config";

export default {
    command: "mount [root] [directory]",
    describe: "Mount files to a directory",
    builder: yargs => {
        return yargs.positional('root', {
            describe: "the root of the directory to mount which can either be a slot or content address"
        }).positional('directory', {
            describe: "the directory to mount"
        }).demandOption(['root', 'directory'])
    },
    handler: async (argv: any) => { await mount(argv.root, argv.directory) }
} satisfies CommandModule

async function mount(root: string, directory: string) {
    const normalRoot = normalizeCode(root)
    if (!normalRoot) invalid("Invalid or missing root parameter");
    const normalDirectory = path.resolve(directory)
    const exists = await directoryExists(normalDirectory)
    if (!exists) invalid(`Directory ${normalDirectory} does not exist`);
    const config = await loadConfiguration()
    const filesConfig = config.servers?.find(config => config.server == 'files')
    if (!filesConfig) invalid(`Config did not contain a files server`);
    const url = filesConfig?.url

    console.log('inv-mount', url, directory)

}