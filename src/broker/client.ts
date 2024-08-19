import { BrokerRegisterResponse } from "../common/types";
import { FindClient } from "../find/client";
import { StorageClient } from "../storage/client";

export interface BrokerClient {
    id: string
    ping(): Promise<boolean>
    broker(id: string): Promise<BrokerClient | undefined>
    find(id: string): Promise<FindClient | undefined>
    storage(id: string): Promise<StorageClient | undefined>
    registered(kind: string): Promise<AsyncIterable<string>>
    register(id: string, url: URL, kind?: string): Promise<BrokerRegisterResponse | undefined>
}