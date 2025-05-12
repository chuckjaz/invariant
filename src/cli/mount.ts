import Koa from 'koa'
import { CommandModule } from "yargs";
import * as path from 'node:path'
import { spawn } from 'node:child_process'

import { directoryExists } from "../common/files";
import { loadConfiguration } from "../config/config";
import { ContentLink } from "../common/types";
import { BrokerWebClient } from "../broker/web/broker_web_client";
import { error, invalid } from "../common/errors";
import { FilesWebClient } from "../files/web/files_web_client";
import { logger } from "../common/web";
import { firstLive } from "../common/verify";
import { resolveId } from "./common/common_resolve";
import { findStorage, firstSlots } from "./start";
import { Files } from "../files/files";
import { randomId } from "../common/id";
import { filesWebHandlers } from "../files/web/files_web_handler";

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
    const config = await loadConfiguration()
    if (!config.broker) invalid("No broker configured");
    const broker = new BrokerWebClient(config.broker)
    const content = await resolveId(broker, root)
    if (!content) invalid(`Invalid root content link`)
    const normalDirectory = path.resolve(directory)
    const exists = await directoryExists(normalDirectory)
    if (!exists) invalid(`Directory ${normalDirectory} does not exist`);
    const filesClientUrl = await firstFilesUrl(broker) ?? await startLocalFilesServer(broker, content)

    const fuseTool = config.tools?.find(tool => tool.tool = 'fuse')
    if (!fuseTool) invalid("No fuse tools was configured");

    spawnFuse(fuseTool.path, filesClientUrl, directory, content, debug)
}

async function startLocalFilesServer(
    broker: BrokerWebClient,
    content: ContentLink
): Promise<URL> {
    let storage = await findStorage(broker)
    if (!storage) error("Could not find a storage to use");
    const slots =  await firstSlots(broker)
    if (!slots) error("Could not find a slots server");

    const id = randomId()
    const files = new Files(id, storage, slots, broker)

    // Validate that the content can be mounted
    try {
        for await (const _ of files.readContentLink(content)) {
            // We just need to verify that the content link is valid by reading the first block
            break;
        }
    } catch (e) {
        error(`Invalid content link: ${e}`)
    }
    const filesHandlers = filesWebHandlers(files)
    const app = new Koa()
    app.use(filesHandlers)
    const httpServer = app.listen()
    const address = httpServer.address();
    if (!address || typeof address !== 'object' || !('port' in address)) {
        throw new Error("Failed to retrieve the server port");
    }
    return new URL(`http://localhost:${address.port}`)
}

async function firstFilesUrl(broker: BrokerWebClient): Promise<URL | undefined> {
    for await (const id of broker.registered('files')) {
        const location = await broker.location(id)
        if (!location) continue
        const urlString = await firstLive(location.urls, id)
        if (!urlString) continue
        const url = new URL(urlString)
        const files = new FilesWebClient(url)
        const pingId = await files.ping()
        if (!pingId) continue
        return url
    }
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
