import { randomBytes } from 'node:crypto';
import { normalizeCode } from "../../common/codes";
import { FindClient } from "../../find/client";
import { StorageClient } from "../../storage/client";
import { BrokerClient } from "../client";
import { ParallelMapper } from '../../common/parallel_mapper';

export interface MockBrokerClient extends BrokerClient {
    registerBroker(broker: BrokerClient): Promise<void>
    registerFind(find: FindClient): Promise<void>
    registerStorage(storage: StorageClient): Promise<void>
}

export function mockBroker(): MockBrokerClient {
    const idBytes = randomBytes(32)
    const id = idBytes.toString('hex')

    const brokers = new Map<string, BrokerClient>()
    const finds = new Map<string, FindClient>()
    const storages = new Map<string, StorageClient>()

    async function ping(): Promise<boolean> {
        return true
    }

    async function broker(id: string): Promise<BrokerClient | undefined> {
        const client = brokers.get(normalizeCode(id) ?? '')
        if (client) return client
        return await findBroker(id, ...brokers.values())
    }

    async function find(id: string): Promise<FindClient | undefined> {
        return finds.get(normalizeCode(id) ?? '')
    }

    async function storage(id: string): Promise<StorageClient | undefined> {
        return storages.get(normalizeCode(id) ?? '')
    }

    async function registered(kind: string): Promise<AsyncIterable<string>> {
        let values: Iterable<string>
        switch (kind) {
            case 'broker': values = brokers.keys(); break
            case 'find': values = finds.keys(); break
            case 'storage': values = storages.keys(); break
            default: throw new Error('Not found')
        }
        return async function *() { yield * values }()
    }

    async function registerBroker(broker: BrokerClient): Promise<void> {
        brokers.set(broker.id, broker)
    }

    async function registerFind(find: FindClient): Promise<void> {
        finds.set(find.id, find)
    }

    async function registerStorage(storage: StorageClient): Promise<void> {
        storages.set(storage.id, storage)
    }

    return {
        id,
        ping,
        broker,
        find,
        storage,
        registered,
        registerBroker,
        registerFind,
        registerStorage,
    }
}

async function findBroker(id: string, ...brokers: BrokerClient[]): Promise<BrokerClient | undefined> {
    let brokerClient: BrokerClient | undefined = undefined
    const mapper = new ParallelMapper<BrokerClient, void>(
        async broker => {
            if (brokerClient) return
            try {
                brokerClient = await broker.broker(id)
            } catch {

            }
        }
    )
    mapper.add(...brokers)
    await mapper.collect()
    return brokerClient
}