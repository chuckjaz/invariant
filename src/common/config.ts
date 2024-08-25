export const BROKER_URL = 'INVARIANT_BROKER_URL'
export const FIND_URL = 'INVARIANT_FIND_URL'
export const STORAGE_URL = 'INVARIANT_STORAGE_URL'
export const PARENT_BROKER_URL = 'INVARIANT_PARENT_BROKER_URL'

export function requiredEnv(name: string): string {
    const value = process.env[name]
    if (!value) {
        throw new Error(`${name} not set`)
    }
    return value
}

export function optionalEnv(name: string): string | undefined {
    return process.env[name]
}

export function brokerUrl(): URL {
    return new URL(requiredEnv(BROKER_URL))
}

export function optionalParentBrokerUrl(): URL | undefined {
    const url = optionalEnv(PARENT_BROKER_URL)
    if (url) return new URL(url)
}

export function findUrl(): URL {
    return new URL(requiredEnv(FIND_URL))
}

export function storageUrl(): URL {
    return new URL(requiredEnv(STORAGE_URL))
}