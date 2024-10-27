import { Channel } from "../../common/channel";
import { normalizeCode } from "../../common/codes";
import { PingableClient } from "../../common/pingable_client";
import { BrokerLocationResponse, BrokerRegisterResponse } from "../../common/types";
import { FindClient } from "../../find/client";
import { Find } from "../../find/web/find_client";
import { SlotsClient } from "../../slots/slot_client";
import { SlotsWebClient } from "../../slots/web/slots_web_client";
import { StorageClient } from "../../storage/client";
import { Storage } from "../../storage/web/storage_web_client";
import { BrokerClient } from "../client";

const brokerLocationPrefix = '/broker/location/'
const brokerRegisteredPrefix = '/broker/registered/'
const brokerRegisterPrefix = '/broker/register/'

type ClientFactory<T> = (id: string, url: URL) => Promise<T>

export class Broker extends PingableClient implements BrokerClient {
    constructor(url: URL, id?: string) {
        super(url, id)
    }

    broker(id: string): Promise<BrokerClient | undefined> {
        return this.client(id, async (id, url) => new Broker(url, id))
    }

    find(id: string): Promise<FindClient | undefined> {
        return this.client(id, async (id, url) => new Find(url, id))
    }

    storage(id: string): Promise<StorageClient | undefined> {
        return this.client(id, async (id, url) => new Storage(url, id))
    }

    slots(id: string): Promise<SlotsClient | undefined> {
        return this.client(id, async (id, url) => new SlotsWebClient(url, id))
    }

    async registered(kind: string): Promise<AsyncIterable<string>> {
        const channel = new Channel<string>()
        try {
            const response = await fetch(new URL(brokerRegisteredPrefix, this.url))
            if (response.status == 200) {
                // TODO: Stream response
                const result = await response.text()
                for (const line of result.split('\n')) {
                    const normalId = normalizeCode(line)
                    if (normalId) await channel.send(normalId)
                    if (channel.closed) break
                }
            }
        } finally {
            channel.close()
        }
        return channel.all()
    }

    register(id: string, url: URL, kind?: string): Promise<BrokerRegisterResponse | undefined> {
        return this.postJson<BrokerRegisterResponse>({ id, url: url.toString(), kind }, brokerRegisterPrefix)
    }

    private async client<T>(id: string, factory: ClientFactory<T>): Promise<T | undefined> {
        const normalId = normalizeCode(id)
        if (!normalId) return
        const response = await fetch(new URL(brokerLocationPrefix + normalId, this.url))
        if (response.status == 200) {
            const result = await response.json() as BrokerLocationResponse
            if ('id' in result &&  normalId == normalizeCode(result.id) && 'url' in result) {
                return factory(normalId, new URL(result.url))
            }
        }
    }
}
