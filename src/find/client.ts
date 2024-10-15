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
    ping(): Promise<string | undefined>
    find(id: string): Promise<FindResult>
    has(container: string, ids: string[]): Promise<boolean>
    notify(find: string): Promise<boolean>
}