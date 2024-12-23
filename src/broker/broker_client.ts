import { BrokerRegisterResponse } from "../common/types";
import { FindClient } from "../find/client";
import { SlotsClient } from "../slots/slot_client";
import { StorageClient } from "../storage/client";

export interface BrokerClient {
    ping(): Promise<string | undefined>
    broker(id: string): Promise<BrokerClient | undefined>
    find(id: string): Promise<FindClient | undefined>
    storage(id: string): Promise<StorageClient | undefined>
    slots(id: string): Promise<SlotsClient | undefined>
    registered(kind: string): AsyncIterable<string>
    register(id: string, url: URL, kind?: string): Promise<BrokerRegisterResponse | undefined>
}

