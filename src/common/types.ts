export interface BrokerGetResponse {
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
