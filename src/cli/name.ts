import { CommandModule } from "yargs"
import { loadConfiguration } from "../config/config"
import { error, invalid } from "../common/errors"
import { defaultBroker } from "./common/common_broker"
import { first } from "./common/common_first"
import { normalizeCode } from "../common/codes"

export default {
    command: 'name [name]',
    describe: "Create or update a name",
    builder: yargs => {
        return yargs.positional('content', {
            describe: "The name to create or update",
        })
        .option('address', {
            describe: "The address to associate to the name",
            alias: 'a'
        })
        .option('slot', {
            describe: "The address is to a slot",
            boolean: true
        })
        .option('previous', {
            describe: "Update the name. The name must have the previous value"
        })
        .demandOption('name', 'address')
    },
    handler: async (argv: any) => {
        await name(argv.name, argv.address, argv.slot, argv.previous)
    }
} satisfies CommandModule

async function name(name: string, address: string, slot?: boolean, previous?: string) {
    const normalAddress = normalizeCode(address)
    if (!normalAddress) error(`Invalid address: ${address}`)
    const config = await loadConfiguration()
    const broker = await defaultBroker(config)
    const names = await first("names", broker)
    if (previous) {
        const normalPrevious = normalizeCode(previous)
        if (!normalPrevious) error(`Invalid previous: ${previous}`)
        await names.update(name, normalAddress, normalPrevious, undefined, slot)
    } else {
        await names.register(name, normalAddress, undefined, slot)
    }
}
