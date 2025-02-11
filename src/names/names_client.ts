export interface NamesClient {
    ping(): Promise<string | undefined>
    lookup(name: string): Promise<LookupResult>
    register(name: string, address: string, ttl?: number): Promise<void>
    update(name: string, previous: string, address: string, ttl?: number): Promise<boolean>
}

export interface LookupResult {
    name: string
    address: string
    ttl: number
    authoritative?: boolean
}
