import { BrokerClient } from "../broker/client";
import { FindClient } from "../find/client";
import { Channel } from "./channel";
import { ParallelContext } from "./parallel_context";

export async function *findInFinder(
    broker: BrokerClient,
    id: string,
    finder: FindClient,
    context: ParallelContext = new ParallelContext()
): AsyncIterable<string> {
    const channel = new Channel<string>()
    const finderId = await finder.ping()
    const seen = new Set([finderId])
    const reported = new Set<string>()
    let pending = 1

    async function findIn(client: FindClient) {
        if (channel.closed) return
        pending--
        const results = await client.find(id)
        if (channel.closed) return
        for await (const result of results) {
            if (channel.closed) break
            switch (result.kind) {
                case "HAS":
                    const container = result.container
                    if (reported.has(container)) break
                    reported.add(container)
                    channel.send(container)
                    break
                case "CLOSER": {
                    const closerId = result.find
                    if (seen.has(closerId)) break
                    seen.add(closerId)
                    const closerClient = await broker.find(closerId)
                    if (closerClient) {
                        pending++
                        context.add(async () => await findIn(closerClient))
                    }
                    break
                }
            }
        }
        if (pending <= 0 && !channel.closed) channel.close()
    }

    context.add(async () => await findIn(finder))

    yield *channel.all()
}
