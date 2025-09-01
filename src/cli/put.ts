import { CommandModule } from "yargs"
import { Data, StorageClient } from "../storage/storage_client"
import fs from 'node:fs/promises'
import { dataFromBuffers } from "../common/data"
import { createHash } from "node:crypto"
import { loadConfiguration } from "../config/config"
import { defaultBroker } from "./common/common_broker"
import { findStorage } from "./common/common_storage"

export default {
    command: 'put [filename]',
    describe: "Put a file a storage",
    builder: yargs => {
        return yargs.positional('filename', {
            describe: "The name of the file to upload",
        }).option('storage', {
            alias: 's',
            describe: "The storage to use. Defaults to the first storage by the connected broker. Can be the URL or the ID of the storage",
            string: true
        }).option("auth", {
            describe: "An authentication token",
            string: true
        })
        .demandOption('filename')
    },
    handler: async (argv: any) => {
        await put_file(argv.filename, argv.storage, argv.auth)
    }
} satisfies CommandModule

async function put(storage: StorageClient, filename: string): Promise<string> {
    const hasher = createHash('sha256')
    const buffer = await fs.readFile(filename)
    hasher.update(buffer)
    const digest = hasher.digest()
    const code = digest.toString('hex')
    if (await storage.has(code)) {
        return code
    }
    const result = await storage.put(code, dataFromBuffers([buffer]))
    if (!result) throw new Error('Could not upload data')
    return code
}

async function put_file(filename: string, storageSpec?: string, auth?: string) {
    const configuration = await loadConfiguration()
    const broker = await defaultBroker(configuration)
    const storage = await findStorage(broker, storageSpec, auth)
    const result = await put(storage, filename)
    console.log(filename, result)
}
