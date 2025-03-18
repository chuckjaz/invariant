import { CommandModule } from "yargs";
import { normalizeCode } from "../common/codes";
import { invalid } from "../common/errors";
import { loadConfiguration } from "../config/config";
import { firstSlots } from "./start";
import { defaultBroker } from "./common/common_broker";

export default {
    command: 'publish [slot] [address] [previous]',
    describe: "Publish a value to a slot",
    builder: yargs => {
        return yargs.positional('slot', {
            describe: "The slot to update",
        }).positional('address', {
            describe: "The new address in the slot"
        }).positional('previous value', {
            describe: "The previous address in the slot"
        })
    },
    handler: async (argv: any) => { await publish(
        argv.slot,
        argv['address'],
        argv['previous']
    )}
} satisfies CommandModule

async function publish(slot: string, address: string, previous: string) {
    const normalSlot = normalizeCode(slot)
    const normalAddress = normalizeCode(address)
    const normalPrevious = normalizeCode(previous)
    if (!normalSlot) invalid('Incorrect formed slot');
    if (!normalAddress) invalid('Incorrect formed address');
    if (!normalPrevious) invalid('Incorrect formed previous address');

    console.log("Updating slot", normalSlot)
    const configuration = await loadConfiguration()
    const broker = await defaultBroker(configuration)
    const slots = await firstSlots(broker)
    if (!slots) {
        invalid("Could not find a slots server")
    }

    const result = await slots.put(
        normalSlot,
        {
            address: normalAddress,
            previous: normalPrevious
       }
    )

    if (!result) {
        invalid(`Failed to update the slot`)
    }
    console.log("Updated slot:", slot)
}