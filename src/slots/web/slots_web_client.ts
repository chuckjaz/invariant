import { normalizeCode } from "../../common/codes";
import { PingableClient } from "../../common/pingable_client";
import { SlotConfiguration, SlotsGetResponse, SlotsPutRequest, SlotsRegisterRequest } from "../../common/types";
import { SlotsClient } from "../slot_client";

export class SlotsWebClient extends PingableClient implements SlotsClient {
    constructor(url: URL, id?: string) {
        super(url, id)
    }

    async has(id: string): Promise<boolean> {
        const normalId = normalizeCode(id)
        if (!normalId) return false
        const request = new URL(`/slots/${id}`, this.url)
        const response = await fetch(request, { method: 'HEAD' })
        return response.status == 200
    }

    async get(id: string): Promise<SlotsGetResponse> {
        return await super.getJson(`/slots/${id}`)
    }

    put(id: string, request: SlotsPutRequest): Promise<boolean> {
        return super.putJson(request, `/slots/${id}`)
    }

    async history(id: string): Promise<AsyncIterable<SlotsGetResponse>> {
        return super.getJsonStream<SlotsGetResponse>(`/slots/history/${id}`)
    }

    async config(id: string): Promise<SlotConfiguration> {
        return super.getJson<SlotConfiguration>(`/slots/configuration/${id}`)
    }

    register(request: SlotsRegisterRequest): Promise<boolean> {
        return super.putJson(request, '/slots/register/')
    }
}
