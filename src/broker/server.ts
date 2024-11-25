import { BrokerRegisterResponse } from "../common/types"

export interface BrokerServer {
    ping(): Promise<string>
    location(id: string): Promise<URL | undefined>
    register(id: string, url: URL, kind?: string): Promise<BrokerRegisterResponse | undefined>
    registered(kind: string): Promise<AsyncIterable<string>>
}