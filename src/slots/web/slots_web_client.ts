import { jsonStream } from "../../common/parseJson";
import { PingableClient } from "../../common/pingable_client";
import { SlotsGetResponse, SlotsPutRequest, SlotsRegisterRequest } from "../../common/types";
import { SlotsClient } from "../slot_client";

export class SlotsWebClient extends PingableClient implements SlotsClient {
    constructor(id: string, url: URL) {
        super(id, url)
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

    register(request: SlotsRegisterRequest): Promise<boolean> {
        return super.putJson(request, '/slots/register/')
    }
}
