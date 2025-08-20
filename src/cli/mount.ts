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
import { logger, logHandler } from "../common/web";
import { firstLive } from "../common/verify";
import { resolveId } from "./common/common_resolve";
import { findStorage, firstSlots } from "./start";
import { Files } from "../files/files";
import { randomId } from "../common/id";
import { filesWebHandlers } from "../files/web/files_web_handler";
import { LayeredFiles } from '../files/layer/file_layer';
import { FilesClient, Node } from '../files/files_client';

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
        }).option('slot', {
            describe: "assume the root is a slot",
            alias: 's',
            boolean: false
        }).demandOption(['root', 'directory'])
    },
    handler: async (argv: any) => { await mount(argv.root, argv.directory, argv.debug, argv.slot) }
} satisfies CommandModule

export async function mount(root: string, directory: string, debug: boolean, assumeSlot?: boolean) {
    const config = await loadConfiguration()
    if (!config.broker) invalid("No broker configured");
    const broker = new BrokerWebClient(config.broker)
    const content = await resolveId(broker, root, assumeSlot)
    if (!content) invalid(`Invalid root content link: ${root}`)
    const normalDirectory = path.resolve(directory)
    const exists = await directoryExists(normalDirectory)
    if (!exists) invalid(`Directory ${normalDirectory} does not exist`);
    const [filesClientUrl, root_node] = await firstFilesUrl(broker, content) ?? await startLocalFilesServer(broker, content, debug)

    const fuseTool = config.tools?.find(tool => tool.tool = 'fuse')
    if (!fuseTool) invalid("No fuse tools was configured");

    spawnFuse(fuseTool.path, filesClientUrl, directory, root_node, debug, fuseTool.args, fuseTool.log)
}

async function startLocalFilesServer(
    broker: BrokerWebClient,
    content: ContentLink,
    debug: boolean,
): Promise<[URL, Node]> {
    let storage = await findStorage(broker)
    if (!storage) error("Could not find a storage to use");
    const slots =  await firstSlots(broker)
    if (!slots) error("Could not find a slots server");

    const id = randomId()
    const files = new Files(id, storage, slots, broker)
    let effectiveFiles: FilesClient = files

    // Validate that the content can be mounted
    try {
        for await (const _ of files.readContentLink(content)) {
            // We just need to verify that the content link is valid by reading the first block
            break;
        }
    } catch (e) {
        error(`Invalid content link: ${e}`)
    }

    // Check if the files root directory contains a .layers file
    const rootOfMount = await files.mount(content)
    let effectiveRoot = rootOfMount
    const layersNode = await files.lookup(rootOfMount, '.layers')
    if (layersNode) {
        // Load the layers configuration from the .layers file
        const layeredFiles = new LayeredFiles(randomId(), files)
        const layerRoot = await layeredFiles.mount(content)
        effectiveFiles = layeredFiles
        effectiveRoot = layerRoot
    }

    const filesHandlers = filesWebHandlers(effectiveFiles)
    const app = new Koa()

    if (debug || (process.env['INVARIANT_LOG'] ?? "").indexOf('files') >= 0) {
        app.use(logHandler('files'))
    }
    app.use(filesHandlers)
    const httpServer = app.listen()
    const address = httpServer.address();
    if (!address || typeof address !== 'object' || !('port' in address)) {
        throw new Error("Failed to retrieve the server port");
    }
    return [new URL(`http://localhost:${address.port}`), effectiveRoot];
}

async function firstFilesUrl(broker: BrokerWebClient, content: ContentLink): Promise<[URL, Node] | undefined> {
    for await (const id of broker.registered('files')) {
        const location = await broker.location(id)
        if (!location) continue
        const urlString = await firstLive(location.urls, id)
        if (!urlString) continue
        const url = new URL(urlString)
        const files = new FilesWebClient(url)
        const pingId = await files.ping()
        if (!pingId) continue
        const root = await files.mount(content)
        return [url, root]
    }
}

function spawnFuse(
    command: string,
    filesUrl: URL,
    directory: string,
    root_node: Node,
    debug: boolean,
    args_spec: string[] = ["--root", "$root", "$url", "$path"],
    log_env: string = "INVARIANT_LOG",
) {
    const stdoutLog = logger('fuse:out')
    const stderrLog = logger('fuse:err')
    const log = logger('fuse')
    const env = process.env
    if (debug) env[log_env] = 'debug'
    const args = args_spec.map(n => {
        switch (n) {
            case "$root": return `${root_node}`;
            case "$url": return filesUrl.toString();
            case "$path": return directory;
            default: return n;
        }
    })
    const childProcess = spawn(command, args, { env })

    childProcess.stdout.on('data', data => { stdoutLog(trim(decode(data))) })
    childProcess.stderr.on('data', data => { stderrLog(trim(decode(data))) })
    childProcess.on('close', code => {
        log(`Fuse terminated: ${code}`)
        process.exit(code)
    })
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
