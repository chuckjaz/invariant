export interface BrokerLocationResponse {
    id: string;
    url: string;
    ttl?: number;
    token?: string;
}

export interface BrokerRegisterRequest {
    id: string;
    url: string;
    kind?: string;
}

export interface BrokerRegisterResponse {
    id: string;
    salt?: string;
    minnonce?: number;
}

export type BrokerServiceQueryResponse = string[]

export interface FindHasRequest {
    container: string
    ids: string[]
}

export interface FindNotifyRequest {
    find: string
}

export interface FindHasResponseEntry {
    kind: "HAS"
    id: string
}

export interface FindCloserResponseEntry {
    kind: "CLOSER"
    id: string
}

export type FindResponseEntry = FindHasResponseEntry | FindCloserResponseEntry

export type FindResponse = FindResponseEntry[]

export interface SlotsGetResponse {
    address: string
    previous: string | "root"
    signature?: string
    proof?: string
}

export interface SlotsPutRequest {
    address: string
    previous: string
    signature?: string
    proof?: string
}

export interface SlotsRegisterRequest {
    id: string
    address: string
    signature?: any
    proof?: any
}

export interface SlotConfiguration {
    signature?: any
    proof?: any
}
