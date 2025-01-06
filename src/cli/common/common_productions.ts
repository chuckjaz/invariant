import { BrokerClient } from "../../broker/broker_client";
import { invalid } from "../../common/errors";
import { ProductionsClient } from "../../productions/productions_client";

export async function findProductions(broker: BrokerClient, idSpec?: string): Promise<ProductionsClient> {
    if (!idSpec) {
        for await (const id of broker.registered('productions')) {
            const productions = await broker.productions(id)
            const receivedId = await productions?.ping()
            if (productions && receivedId) return productions
        }
        invalid('Could not locate a productions server')
    } else {
        const productions =  await broker.productions(idSpec)
        if (productions) return productions
        invalid(`Could not contact productions server: ${idSpec}`)
    }
}