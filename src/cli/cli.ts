import yargs from "yargs"
import check from './check'
import start from './start'

yargs
    .command(check)
    .command(start)
    .demandCommand()
    .wrap(90)
    .help()
    .parse()