import yargs from "yargs"
import check from './check'
import publish from './publish'
import slot from './slot'
import start from './start'
import task from './task'
import upload from './upload'
import mount from "./mount"

yargs
    .command(check)
    .command(mount)
    .command(start)
    .command(publish)
    .command(slot)
    .command(task)
    .command(upload)
    .demandCommand()
    .wrap(90)
    .help()
    .parse()