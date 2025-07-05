import { CommandModule } from "yargs";
import create from "./create";
import init from "./init";
import log from "./log";

export default {
    command: "workspace",
    describe: "Configure and manipulate workspaces",
    builder: yargs => {
        return yargs
            .command(create)
            .command(init)
            .command(log)
            .demandCommand()
    },
    handler: args => {}

} satisfies CommandModule