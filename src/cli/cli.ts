import yargs from "yargs"
import check from './check'
import start from './start'
import upload from "./upload"

yargs
    .command(check)
    .command(start)
    .command(upload)
    .demandCommand()
    .wrap(90)
    .help()
    .parse()