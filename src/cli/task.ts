import { CommandModule } from "yargs"
import { loadConfiguration } from "../config/config"
import { ContentLink } from "../common/types"
import { ContentReader, ContentWriter } from "../files/files_client"
import { ProductionsClient } from "../productions/productions_client"
import { manifestTask, manifestTaskId } from "../tasks/manifest_task"
import { error, invalid } from "../common/errors"
import { defaultBroker } from "./common/common_broker"
import { Files } from "../files/files"
import { findStorage } from "./common/common_storage"
import { firstSlots } from "./start"
import { findProductions } from "./common/common_productions"
import { randomId } from "../common/id"

export default {
    command: 'task [task] [input] [output]',
    describe: `Execute a task`,
    builder: yargs => {
        return yargs.positional('task', {
            describe: 'The name or ID of a task'
        }).positional('input', {
            describe: 'The input slot address'
        }).positional('output', {
            describe: 'The output slot address'
        }).option('storage', {
            alias: 's',
            describe: 'The storage ID to use. Defaults to a finder based storage'
        }).option('auth', {
            describe: 'Authorization for storage'
        })
    },
    handler: (argv: any) => { task(argv.task, argv.input, argv.output, argv.storage, argv.auth) }
} satisfies CommandModule

type TaskFn = (
    content: ContentLink,
    contentReader: ContentReader,
    contentWriter: ContentWriter,
    productions: ProductionsClient
) => Promise<ContentLink>

interface Task {
    name: string
    id: string
    fn: TaskFn
}

const tasks: Task[] = [
    { name: 'manifest', id: manifestTaskId, fn: manifestTask }
]

const nameToTask = new Map<string, Task>()
const idToTask = new Map<string, Task>()

for (const task of tasks) {
    nameToTask.set(task.name, task)
    idToTask.set(task.id, task)
}

function findTask(taskDef: string): Task {
    let task = nameToTask.get(taskDef)
    if (!task) {
        task = idToTask.get(taskDef)
    }
    if (!task) {
        invalid(`Could not find task: ${taskDef}`)
    }
    return task
}

async function task(
    taskDef: string,
    input: string,
    output: string,
    storageDef?: string,
    auth?: string
) {
    const config = await loadConfiguration()
    const task = findTask(taskDef)
    const broker = await defaultBroker(config)
    const storage = await findStorage(broker, storageDef, auth)
    const slots = await firstSlots(broker)
    if (!slots) error('Could not find slots');
    const files = new Files(randomId(), storage, slots, broker, 1)
    const productions = await findProductions(broker)
    const inputContent: ContentLink = {
        address: input,
        slot: true
    }

    const link = await task.fn(inputContent, files, files, productions)
    if (output) {
        const previous = await slots.get(output)
        if (!previous) {
            console.log("Could not find output slot")
        } else {
            const result = await slots.put(output, {
                address: link.address,
                previous: previous.address
            })
            if (!result) {
                console.log("Could not update slot")
            }
        }
    }
    console.log('Result:', link)
}
