import yargs from "yargs"
import check from './check'
import start from './start'
import upload from "./upload"
import slot from './slot'

yargs
    .command(check)
    .command(start)
    .command(upload)
    .command(slot)
    .demandCommand()
    .wrap(90)
    .help()
    .parse()