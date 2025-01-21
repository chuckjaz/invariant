import { BrokerRegisterResponse } from "../common/types";
import { FilesClient } from "../files/files_client";
import { FindClient } from "../find/client";
import { ProductionsClient } from "../productions/productions_client";
import { SlotsClient } from "../slots/slot_client";
import { StorageClient } from "../storage/storage_client";

export interface BrokerClient {
    ping(): Promise<string | undefined>
    broker(id: string): Promise<BrokerClient | undefined>
    files(id: string): Promise<FilesClient | undefined>
    find(id: string): Promise<FindClient | undefined>
    productions(id: string): Promise<ProductionsClient | undefined>
    storage(id: string): Promise<StorageClient | undefined>
    slots(id: string): Promise<SlotsClient | undefined>
    registered(kind: string): AsyncIterable<string>
    register(id: string, url: URL, kind?: string): Promise<BrokerRegisterResponse | undefined>
}

