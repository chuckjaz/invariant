import { BrokerClient } from "../../broker/broker_client";
import { BrokerWebClient } from "../../broker/web/broker_web_client";
import { error } from "../../common/errors";
import { Configuration } from "../../config/config";

export async function defaultBroker(configuration: Configuration): Promise<BrokerClient> {
    if (configuration.broker) {
        const broker =  new BrokerWebClient(configuration.broker)
        const id = await broker.ping()
        if (!id) error('Could not connect to broker')
        return broker
    } else {
        error("Invariant is not connected")
    }
}