import yargs from "yargs"
import check from './check'
import publish from './publish'
import slot from './slot'
import start from './start'
import task from './task'
import upload from './upload'

yargs
    .command(check)
    .command(start)
    .command(slot)
    .command(publish)
    .command(task)
    .command(upload)
    .demandCommand()
    .wrap(90)
    .help()
    .parse()