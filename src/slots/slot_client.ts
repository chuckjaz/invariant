import { SlotConfiguration, SlotsGetResponse, SlotsPutRequest, SlotsRegisterRequest } from "../common/types";

export interface PingClint {

}
export interface SlotsClient {
    ping(): Promise<string | undefined>
    has(id: string): Promise<boolean>
    get(id: string): Promise<SlotsGetResponse>
    put(id: string, request: SlotsPutRequest): Promise<boolean>
    history(id: string): Promise<AsyncIterable<SlotsGetResponse>>
    config(id: string): Promise<SlotConfiguration>
    register(request: SlotsRegisterRequest): Promise<boolean>
}
