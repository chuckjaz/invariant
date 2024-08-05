export interface FindResultHas {
    kind: "HAS"
    container: string
}

export interface FindResultCloser {
    kind: "CLOSER"
    find: string
}

export type FindResultItem = FindResultCloser | FindResultHas
export type FindResult = AsyncIterable<FindResultItem>

export interface FindClient {
    id: string
    ping(): Promise<boolean>
    find(id: string): Promise<FindResult>
    has(container: string, id: string[]): Promise<void>
}