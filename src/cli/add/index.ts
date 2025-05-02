import { CommandModule } from "yargs";
import storage from "./storage";
import find from "./find";

export default {
    command: "add",
    describe: "Add a service to a configuration",
    builder: yargs => {
        return yargs
            .command(find)
            .command(storage)
            .demandCommand()
    },
    handler: args => {}

} satisfies CommandModule