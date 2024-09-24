import { SlotConfiguration, SlotsGetResponse, SlotsPutRequest, SlotsRegisterRequest } from "../common/types";

export interface SlotsClient {
    ping(): Promise<string | undefined>
    get(id: string): Promise<SlotsGetResponse>
    put(id: string, request: SlotsPutRequest): Promise<boolean>
    history(id: string): Promise<AsyncIterable<SlotsGetResponse>>
    config(id: string): Promise<SlotConfiguration>
    register(request: SlotsRegisterRequest): Promise<boolean>
}
