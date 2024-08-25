export const BROKER_URL = 'INVARIANT_BROKER_URL'
export const FIND_URL = 'INVARIANT_FIND_URL'

export function requiredEnv(name: string): string {
    const value = process.env[name]
    if (!value) {
        throw new Error(`${name} not set`)
    }
    return value
}

export function brokerUrl(): URL {
    return new URL(requiredEnv(BROKER_URL))
}

export function findUrl(): URL {
    return new URL(requiredEnv(FIND_URL))
}
