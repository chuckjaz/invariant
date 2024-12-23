import { BrokerClient } from "../../broker/broker_client";
import { findInFinder } from "../../common/findInFinder";
import { randomId } from "../../common/id";
import { ParallelContext } from "../../common/parallel_context";
import { FindClient } from "../../find/client";
import { Data, StorageClient } from "../client";

export class BlockFindingStorage implements StorageClient {
    id: string
    broker: BrokerClient
    finder: FindClient
    backingStorage?: StorageClient
    context: ParallelContext

    constructor(
        broker: BrokerClient,
        finder: FindClient,
        backingStorage?: StorageClient,
        id?: string,
        context: ParallelContext = new ParallelContext()
    ) {
        this.id = id ?? randomId()

        this.broker = broker
        this.finder = finder
        if (backingStorage) this.backingStorage = backingStorage;
        this.context = context
    }

    async ping(): Promise<string | undefined> {
        return this.id
    }

    async get(address: string): Promise<Data | false> {
        if (this.backingStorage) {
            const data = this.backingStorage.get(address)
            if (data) return data
        }
        for await (const storageClient of findStorage(address, this.finder, this.broker, this.context)) {
            const data = await storageClient.get(address)
            if (data) return data
        }
        return false
    }

    async has(address: string): Promise<boolean> {
        if (this.backingStorage && await this.backingStorage.has(address)) return true;
        for await (const storage of findStorage(address, this.finder, this.broker, this.context)) {
            if (await storage.has(address)) return true
        }
        return false
    }

    async put(address: string, data: Data): Promise<boolean> {
        const backingStorage = this.backingStorage
        if (backingStorage) {
            if (await backingStorage.has(address)) return true
            const result = await backingStorage.put(address, data)
            if (result) await this.notifyFinderOf(address);
            return result
        }
        return false
    }

    async post(data: Data): Promise<string | false> {
        const backingStorage = this.backingStorage
        if (backingStorage) {
            const result = await backingStorage.post(data)
            if (result) await this.notifyFinderOf(result);
            return result
        }
        return false
    }

    async fetch(): Promise<boolean> {
        return false
    }

    private async notifyFinderOf(address: string) {
        const backingId = await this.backingStorageId()
        if (backingId) this.finder.has(backingId, [address]);
    }

    private _backingStorageId?: string
    private async backingStorageId(): Promise<string | undefined> {
        let backingStorageId = this._backingStorageId
        if (backingStorageId) return backingStorageId
        const backingStorage = this.backingStorage
        if (backingStorage) {
            backingStorageId = await backingStorage.ping()
            this._backingStorageId = backingStorageId
        }
        return backingStorageId
    }
 }

 async function *findStorage(
    address: string,
    finder: FindClient,
    broker: BrokerClient,
    context: ParallelContext
): AsyncIterable<StorageClient> {
    for await (const id of findInFinder(broker, address, finder, context)) {
        const client = await broker.storage(id)
        if (client) yield client
    }
 }
