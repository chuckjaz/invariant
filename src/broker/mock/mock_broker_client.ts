import { randomBytes } from 'node:crypto';
import { normalizeCode } from "../../common/codes";
import { FindClient } from "../../find/client";
import { StorageClient } from "../../storage/storage_client";
import { BrokerClient } from "../broker_client";
import { ParallelMapper } from '../../common/parallel_mapper';
import { BrokerRegisterResponse } from '../../common/types';
import { SlotsClient } from '../../slots/slot_client';

export interface MockBrokerClient extends BrokerClient {
    id: string
    registerBroker(broker: BrokerClient): Promise<void>
    registerFind(find: FindClient): Promise<void>
    registerStorage(storage: StorageClient): Promise<void>
    registerSlots(slots: SlotsClient): Promise<void>
}

export function mockBroker(): MockBrokerClient {
    const idBytes = randomBytes(32)
    const id = idBytes.toString('hex')

    const brokers = new Map<string, BrokerClient>()
    const finds = new Map<string, FindClient>()
    const storages = new Map<string, StorageClient>()
    const slotsMap = new Map<string, SlotsClient>()

    async function ping(): Promise<string> {
        return id
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

    async function slots(id: string): Promise<SlotsClient | undefined> {
        return slotsMap.get(normalizeCode(id) ?? '')
    }

    async function *registered(kind: string): AsyncIterable<string> {
        let values: Iterable<string>
        switch (kind) {
            case 'broker': values = brokers.keys(); break
            case 'find': values = finds.keys(); break
            case 'storage': values = storages.keys(); break
            case 'slots': values = slotsMap.keys(); break
            default: throw new Error('Not found')
        }
        yield *values
    }

    async function registerBroker(broker: BrokerClient): Promise<void> {
        const id = await broker.ping()
        if (id) brokers.set(id, broker)
    }

    async function registerFind(find: FindClient): Promise<void> {
        const id = await find.ping()
        if (id) finds.set(id, find)
    }

    async function registerStorage(storage: StorageClient): Promise<void> {
        const id = await storage.ping()
        if (id) storages.set(id, storage)
    }

    async function registerSlots(slotsClient: SlotsClient): Promise<void> {
        const id = await slotsClient.ping()
        if (id) slotsMap.set(id, slotsClient)
    }

    async function register(id: string, url: URL, kind?: string): Promise<BrokerRegisterResponse | undefined> {
        return undefined
    }

    return {
        id,
        ping,
        broker,
        find,
        slots,
        storage,
        registered,
        registerBroker,
        registerFind,
        registerStorage,
        registerSlots,
        register,
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