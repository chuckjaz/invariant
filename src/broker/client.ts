import { FindClient } from "../find/client";
import { StorageClient } from "../storage/client";

export interface BrokerClient {
    id: string
    ping(): Promise<boolean>
    broker(id: string): Promise<BrokerClient>
    find(id: string): Promise<FindClient>
    storage(id: string): Promise<StorageClient>
    registered(kind: string): Promise<AsyncIterable<string>>
}