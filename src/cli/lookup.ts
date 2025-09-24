import { CommandModule } from "yargs";
import { loadConfiguration } from "../config/config";
import { invalid } from "../common/errors";
import { BrokerWebClient } from "../broker/web/broker_web_client";
import { resolveId } from "./common/common_resolve";

export default {
    command: "lookup [name]",
    describe: "Lookup a name",
    builder: yargs => {
        return yargs.positional('name', {
            describe: "The name from name service",
        }).demandOption(['name'])
    },
    handler: async (argv: any) => { await lookup(argv.name) }
} satisfies CommandModule

async function lookup(name: string) {
    const config = await loadConfiguration()
    if (!config.broker) invalid("No broker configured");
    const broker = new BrokerWebClient(config.broker)
    const content = await resolveId(broker, name)
    if (!content) {
        console.log(`Name: '${name}' not found`)
        return
    }
    console.log(content)
}