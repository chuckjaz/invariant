import { SlotConfiguration, SlotsGetResponse, SlotsPutRequest, SlotsRegisterRequest } from "../../common/types";
import { SlotsClient } from "../slot_client";
import { randomBytes } from 'node:crypto'
import { BroadcastChannel } from "../../common/broadcast_channel";

export function mockSlots(): MockSlotsServer {
    return new MockSlotsServer()
}

export class MockSlotsServer implements SlotsClient {
    private slots = new Map<string, SlotsGetResponse[]>()
    private watches = new BroadcastChannel<string>()

    id = randomBytes(32).toString('hex')

    async ping(): Promise<string | undefined> {
        return this.id
    }

    async get(id: string): Promise<SlotsGetResponse> {
        const responses = this.required(id)
        return responses[responses.length - 1]
    }

    async put(id: string, request: SlotsPutRequest): Promise<boolean> {
        const responses = this.required(id)
        const last = responses[responses.length - 1]
        if (last.address == request.previous) {
            responses.push(request)
            this.watches.send(this.watches.topic<SlotsGetResponse>(id), request)
            return true
        }
        return false
    }

    async *history(id: string): AsyncIterable<SlotsGetResponse> {
        yield *this.required(id)
    }

    async *watch(id: string): AsyncIterable<SlotsGetResponse> {
        const current = await this.get(id)
        yield current
        const channel = this.watches.subscribe(this.watches.topic<SlotsGetResponse>(id))
        yield *channel.all()
    }

    async register(request: SlotsRegisterRequest): Promise<boolean> {
        const id = request.id
        if (!this.slots.has(id)) {
            this.slots.set(id, [{ address: request.address, previous: "root" }])
            return true
        }
        return false
    }

    async config(id: string): Promise<SlotConfiguration> {
        return { }
    }

    private required(id: string): SlotsGetResponse[] {
        const responses = this.slots.get(id)
        if (!responses || responses.length == 0) throw Error(`Unknown ${id}`);
        return responses
    }
}
