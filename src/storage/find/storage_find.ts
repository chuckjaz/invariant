import { BrokerClient } from "../../broker/client";
import { Channel } from "../../common/channel";
import { FindClient } from "../../find/client";
import { Data, StorageClient } from "../client";
import { randomBytes } from 'node:crypto'

export class BlockFindingStorage implements StorageClient {
    id = randomBytes(32).toString('hex')
    broker: BrokerClient
    finder: FindClient
    backingStorage?: StorageClient

    constructor(broker: BrokerClient, finder: FindClient, backingStorage?: StorageClient) {
        this.broker = broker
        this.finder = finder
        if (backingStorage) this.backingStorage = backingStorage;
    }

    async ping(): Promise<string | undefined> {
        return this.id
    }

    async get(address: string): Promise<Data | false> {
        for await (const storageClient of findStorage(address, this.finder, this.broker)) {
            const data = await storageClient.get(address)
            if (data) return data
        }
        return false
    }

    async has(address: string): Promise<boolean> {
        for await (const _ of findStorage(address, this.finder, this.broker)) {
            return true
        }
        return false
    }

    async put(address: string, data: Data): Promise<boolean> {
        const backingStorage = this.backingStorage
        if (backingStorage) {
            if (await backingStorage.has(address)) return true
            const result = await backingStorage.put(address, data)
            if (result) await this.nofityFinderOf(address);
            return result
        }
        return false
    }

    async post(data: Data): Promise<string | false> {
        const backingStorage = this.backingStorage
        if (backingStorage) {
            const result = await backingStorage.post(data)
            if (result) await this.nofityFinderOf(result);
            return result
        }
        return false
    }

    async fetch(): Promise<boolean> {
        return false
    }

    private async nofityFinderOf(address: string) {
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

 function findStorage(address: string, finder: FindClient, broker: BrokerClient): AsyncIterable<StorageClient> {
    const storageChannel = new Channel<StorageClient>()
    const findChannel = new Channel<FindClient>()
    let pendingFinds = 0

    function findIn(finder?: FindClient) {
        if (finder) {
            pendingFinds++
            findChannel.send(finder)
        }
    }

    function found(storageClient?: StorageClient) {
        if (storageClient) {
            storageChannel.send(storageClient)
        }
    }

    async function findFinders() {
        for await (const finder of findChannel.all()) {
            pendingFinds--
            for await (const result of await finder.find(address)) {
                switch (result.kind) {
                    case "CLOSER": {
                        findIn(await broker.find(result.find))
                        break
                    }
                    case "HAS": {
                        const storageClient = await broker.storage(result.container)
                        if (storageClient && await storageClient.has(address)) {
                            found(storageClient)
                        }
                        break
                    }
                }
                if (storageChannel.closed || findChannel.closed) {
                    storageChannel.close()
                    findChannel.close()
                }
            }
            if (storageChannel.closed || findChannel.closed || pendingFinds == 0) {
                storageChannel.close()
                findChannel.close()
                return
            }
        }
    }

    findIn(finder)
    findFinders()
    return storageChannel.all()
 }
