import yargs from "yargs"
import check from './check'

yargs
    .command(check)
    .demandCommand()
    .help()
    .parse()