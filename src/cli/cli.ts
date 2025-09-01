import yargs from "yargs"
import check from './check'
import publish from './publish'
import slot from './slot'
import start from './start'
import task from './task'
import upload from './upload'
import mount from "./mount"
import pin from "./pin"
import init from "./init"
import add from "./add"
import workspace from "./workspace"
import name from "./name"
import put from "./put"

export function startCli() {
    yargs
        .command(add)
        .command(check)
        .command(init)
        .command(mount)
        .command(name)
        .command(pin)
        .command(publish)
        .command(put)
        .command(start)
        .command(slot)
        .command(task)
        .command(upload)
        .command(workspace)
        .demandCommand()
        .wrap(120)
        .help()
        .parse()
}
