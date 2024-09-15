import { SlotsGetResponse, SlotsPutRequest, SlotsRegisterRequest } from "../common/types";

export interface SlotsClient {
    ping(): Promise<string | undefined>
    get(id: string): Promise<SlotsGetResponse>
    put(id: string, request: SlotsPutRequest): Promise<boolean>
    history(id: string): Promise<AsyncIterable<SlotsGetResponse>>
    register(request: SlotsRegisterRequest): Promise<boolean>
}
