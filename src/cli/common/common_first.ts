import { BrokerClient } from "../../broker/broker_client";
import { error } from "../../common/errors";
import { PingableClient } from "../../common/pingable_client";
import { DistributeClient } from "../../distribute/distribute_client";
import { FilesClient } from "../../files/files_client";
import { FindClient } from "../../find/client";
import { NamesClient } from "../../names/names_client";
import { ProductionsClient } from "../../productions/productions_client";
import { SlotsClient } from "../../slots/slot_client";
import { StorageClient } from "../../storage/storage_client";

export function first(kind: "broker", broker: BrokerClient): Promise<BrokerClient>
export function first(kind: "distribute", broker: BrokerClient): Promise<DistributeClient>
export function first(kind: "files", broker: BrokerClient): Promise<FilesClient>
export function first(kind: "find", broker: BrokerClient): Promise<FindClient>
export function first(kind: "names", broker: BrokerClient): Promise<NamesClient>
export function first(kind: "productions", broker: BrokerClient): Promise<ProductionsClient>
export function first(kind: "storage", broker: BrokerClient): Promise<StorageClient>
export function first(kind: "slots", broker: BrokerClient): Promise<SlotsClient>
export async function first(kind: string, broker: BrokerClient): Promise<any> {
    for await (const id of broker.registered(kind)) {
        const client = await get(kind, id, broker) as PingableClient
        const response = await client.ping()
        if (id == response) return client
    }
    error(`Could not find client for ${kind}`)
}

function get(kind: string, id: string, broker: BrokerClient): Promise<any> {
    switch (kind) {
        case "broker": return broker.broker(id);
        case "distribute": return broker.distribute(id);
        case "files": return broker.files(id);
        case "find": return broker.find(id);
        case "names": return broker.names(id);
        case "productions": return broker.productions(id);
        case "storage": return broker.storage(id)
        case "slots": return broker.slots(id);
    }
    error("Unknown kind")
}

export type Clients = BrokerClient | DistributeClient | FilesClient | FindClient |
    NamesClient | ProductionsClient | StorageClient | SlotsClient