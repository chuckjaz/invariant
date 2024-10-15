import { writeDataToFile } from "../common/data"
import { ParallelMapper } from "../common/parallel_mapper"
import { dataToString, safeParseJson } from "../common/parseJson"
import { Entry, EntryKind } from "../common/types"
import { Storage } from "../storage/web/storage_client"
import * as path from 'node:path'

const storage = new Storage(
    new URL("https://storage.chuckjaz.workers.dev"),
    undefined,
    (_, init) => {
        if (init?.method == 'PUT') {
            init.headers = [["X-Custom-Auth-Key", process.env.STORAGE_AUTH as string]]
        }
        return init
    }
)

async function getDirectoryEntries(code: string): Promise<Entry[]> {
    const directoryData = await storage.get(code)
    if (!directoryData) throw new Error(`Could not obtain directory data for ${code}`)
    const directoryDataText = await dataToString(directoryData)
    const directoryJson = safeParseJson(directoryDataText)
    if (!directoryJson || !Array.isArray(directoryJson)) {
        throw new Error(`Invalid JSON data for ${code}`)
    }
    return directoryJson
}

async function writeDirectory(code: string, location: string) {
    const mapper = new ParallelMapper<{entry: Entry, location: string}, undefined>(
        async ({entry, location}, schedule) => {
            const fullName = path.join(location, entry.name)
            if (entry.kind == EntryKind.Directory) {
                const entries = await getDirectoryEntries(entry.content.address)
                schedule(...entries.map(entry => ({ entry, location: fullName })))
            } else {
                const data = await storage.get(entry.content.address)
                if (!data) throw new Error(`Could not obtain file for ${fullName}`);
                await writeDataToFile(data, fullName)
            }
        },
        100
    )
    const entries = await getDirectoryEntries(code)
    mapper.add(...entries.map(entry => ({ entry, location })))
    await mapper.collect()
}

writeDirectory('52eb3f196d33363dee26a25c53a20b6c58a7cbf859a39b52adf5206e74d90c17', `/tmp/src`).catch(e => console.error(e))