import { PingableClient } from "../../common/pingable_client";
import { LookupResult, NamesClient } from "../names_client";

export class NamesWebClient extends PingableClient implements NamesClient {
    lookup(name: string): Promise<LookupResult> {
        return this.getJson(`/names/lookup/${name}`)
    }

    async register(name: string, address: string, ttl?: number, slot?: boolean): Promise<void> {
        const value: any = { name, address };
        if (ttl) value.ttl = ttl
        if (slot) value.slot = slot
        await this.putJson(value, `/names/register`)
    }

    update(name: string, previous: string, address: string, ttl?: number, slot?: boolean): Promise<boolean> {
        const value: any = { name, previous, address }
        if (ttl) value.ttl = ttl;
        if (slot) value.slot = slot;
        return this.postJson(value, '/names/update')
    }
}
