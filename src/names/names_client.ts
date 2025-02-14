export interface NamesClient {
    ping(): Promise<string | undefined>
    lookup(name: string): Promise<LookupResult>
    register(name: string, address: string, ttl?: number, slot?: boolean): Promise<void>
    update(name: string, previous: string, address: string, ttl?: number, slot?: boolean): Promise<boolean>
}

export interface LookupResult {
    name: string
    address: string
    ttl: number
    authoritative?: boolean
    slot?: boolean
}
