import { CommandModule } from "yargs";
import { configurationExists, newConfiguration, saveConfiguration } from "../config/config";
import { BrokerWebClient } from "../broker/web/broker_web_client";
import { error } from "../common/errors";

export default {
    command: "init [broker url]",
    describe: "Create a new Invariant configuration",
    builder: yargs =>
        yargs.positional('broker', {
            describe: "An optional connection to the broker"
        }),
    handler: async (argv: any) => await init(argv.broker)
} satisfies CommandModule

async function init(brokerLocation?: string) {
    if (await configurationExists()) {
        console.error("Invariant has already been configured")
        return
    }

    const configuration = newConfiguration()
    await saveConfiguration(configuration)

    if (brokerLocation)  {
        const brokerUrl = new URL(brokerLocation)
        const broker = new BrokerWebClient(brokerUrl)
        const id = await broker.ping()
        if (!id) {
            error(`Could not connect to broker: ${brokerLocation}`)
        }
        configuration.broker = brokerUrl
    }
    console.log(`Configuration written to: ${configuration.configPath}`)
}
