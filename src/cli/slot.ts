import { CommandModule } from "yargs";
import { normalizeCode } from "../common/codes";
import { invalid } from "../common/errors";
import { loadConfiguration } from "../config/config";
import { BrokerWebClient } from "../broker/web/broker_web_client";
import { firstSlots } from "./start";
import { randomId } from "../common/id";

export default {
    command: 'slot [address]',
    describe: "Create a slot for an address",
    builder: yargs => {
        return yargs.positional('address', {
            describe: "The initial address value of the slot",
        })
    },
    handler: async argv => { await slot((argv as any).address) }
} satisfies CommandModule

async function slot(address: string) {
    console.log("Creating slot for address", address)
    const normalAddress = normalizeCode(address)
    if (!normalAddress) {
        invalid("Expected a valid content address")
    }
    const configuration = await loadConfiguration()
    if (!configuration.broker) {
        invalid("No broker configured")
    }

    const broker = new BrokerWebClient(configuration.broker)

    const slots = await firstSlots(broker)
    if (!slots) {
        invalid("Could not find a slots server")
    }

    const id = randomId()

    const result = await slots.register({
        id,
        address,
    })

    if (!result) {
        invalid(`Creating the slot failed`)
    }
    console.log("Slot created:", id)
}