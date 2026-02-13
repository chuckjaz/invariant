import { invalid } from "../../common/errors";
import { log_fetch } from "../../common/log_fetch";
import { PingableClient } from "../../common/pingable_client";
import { DistributeClient } from "../distribute_client";

export class DistributeWebClient extends PingableClient implements DistributeClient {
    constructor(url: URL, id?: string) {
        super(url, id)
    }

    has(container: string, ids: string[]): Promise<boolean> {
        return this.putJson({ container, ids }, `/distributor/has`)
    }

    async needed(storage: string, id: string): Promise<boolean> {
        const result = await this.get(`needed/${storage}/${id}`)
        return result.toLowerCase() != 'false'
    }

    register(server: string): Promise<void> {
        return this.put(`register/storage/${server}`)
    }

    unregister(server:string): Promise<void> {
        return this.put(`unregister/storage/${server}`)
    }

    private async get(tail: string): Promise<string> {
        const url = new URL(`/distributor/${tail}`, this.url)
        const result = await log_fetch(url)
        if (result.ok) {
            return await result.text()
        }
        if (result.status == 404) invalid('Unknown request', 404);
        invalid("Invalid response", result.status)
    }

    private async put(tail: string): Promise<void> {
        const request: RequestInit = {
            method: 'PUT',
            duplex: "half",
        }
        const url = new URL(`/distributor/${tail}`, this.url)
        const result = await log_fetch(url, request)
        if (result.ok) return
        if (result.status == 404) invalid('Unknown request', 404);
        invalid("Invalid response", result.status)
    }
}
