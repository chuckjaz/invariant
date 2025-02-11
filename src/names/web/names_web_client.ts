import { PingableClient } from "../../common/pingable_client";
import { LookupResult, NamesClient } from "../names_client";

export class NamesWebClient extends PingableClient implements NamesClient {
    lookup(name: string): Promise<LookupResult> {
        return this.getJson(`/names/lookup/${name}`)
    }

    async register(name: string, address: string, ttl?: number): Promise<void> {
        await this.putJson({ name, address, ttl }, `/names/register`)
    }

    update(name: string, previous: string, address: string, ttl?: number): Promise<boolean> {
        return this.postJson({ name, previous, address, ttl }, '/names/update')
    }
}
