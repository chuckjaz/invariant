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

export interface HasListener {
    has(container: string, ids: string[]): Promise<boolean>
}

export interface FindClient extends HasListener {
    ping(): Promise<string | undefined>
    find(id: string): Promise<FindResult>
    notify(find: string): Promise<boolean>
}