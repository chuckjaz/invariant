import { CommandModule } from "yargs";
import * as path from 'node:path'
import { spawn } from 'node:child_process'

import { directoryExists } from "../common/files";
import { loadConfiguration } from "../config/config";
import { jsonFromText } from "../common/data";
import { contentLinkSchema } from "../common/schema";
import { ContentLink } from "../common/types";
import { BrokerWebClient } from "../broker/web/broker_web_client";
import { FilesClient } from "../files/files_client";
import { invalid } from "../common/errors";
import { FilesWebClient } from "../files/web/files_web_client";
import { logger } from "../common/web";

export default {
    command: "mount [root] [directory]",
    describe: "Mount files to a directory",
    builder: yargs => {
        return yargs.positional('root', {
            describe: "the content link root of the directory to mount"
        }).positional('directory', {
            describe: "the directory to mount"
        }).option('debug', {
            describe: "turn on debug logs",
            boolean: true
        }).demandOption(['root', 'directory'])
    },
    handler: async (argv: any) => { await mount(argv.root, argv.directory, argv.debug) }
} satisfies CommandModule

async function mount(root: string, directory: string, debug: boolean) {
    const content = jsonFromText(contentLinkSchema, root) as ContentLink
    if (!content) invalid(`Invalid root content link`)
    const normalDirectory = path.resolve(directory)
    const exists = await directoryExists(normalDirectory)
    if (!exists) invalid(`Directory ${normalDirectory} does not exist`);
    const config = await loadConfiguration()
    if (!config.broker) invalid("No broker configured");
    const broker = new BrokerWebClient(config.broker)
    const filesClientUrl = await firstFilesUrl(broker)

    const fuseTool = config.tools?.find(tool => tool.tool = 'fuse')
    if (!fuseTool) invalid("No fuse tools was configured");


    spawnFuse(fuseTool.path, filesClientUrl, directory, content, debug)

}

async function firstFilesUrl(broker: BrokerWebClient): Promise<URL> {
    for await (const id of broker.registered('files')) {
        const location = await broker.location(id)
        if (!location) continue
        const url = new URL(location.url)
        const files = new FilesWebClient(url)
        const pingId = await files.ping()
        if (!pingId) continue
        return url
    }
    invalid("Could not find a files server in broker")
}

function spawnFuse(command: string, filesUrl: URL, directory: string, root: ContentLink, debug: boolean) {
    const stdoutLog = logger('fuse:out')
    const stderrLog = logger('fuse:err')
    const log = logger('fuse')
    const env = process.env
    if (debug) env['INVARIANT_LOG'] = 'debug'
    const childProcess = spawn(command, [filesUrl.toString(), directory, JSON.stringify(root)], { env })

    childProcess.stdout.on('data', data => { stdoutLog(trim(decode(data))) })
    childProcess.stderr.on('data', data => { stderrLog(trim(decode(data))) })
    childProcess.on('close', code => { log(`Fuse terminated: ${code}`) })
}

function decode(data: any): any {
    return typeof data == 'string' ? data : data instanceof Buffer ? new TextDecoder().decode(data) : data
}

function trim(data: any): any {
    if (typeof data == 'string') {
        return data.trimEnd()
    }
    return data
}
