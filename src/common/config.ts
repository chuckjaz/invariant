export const BROKER_URL = 'INVARIANT_BROKER_URL'
export const FIND_URL = 'INVARIANT_FIND_URL'
export const STORAGE_URL = 'INVARIANT_STORAGE_URL'
export const STORAGE_DIRECTORY = 'INVARIANT_STORAGE_DIRECTORY'
export const PARENT_BROKER_URL = 'INVARIANT_PARENT_BROKER_URL'
export const SLOTS_URL = 'INVARIANT_SLOTS_URL'
export const SLOTS_DIRECTORY = 'INVARIANT_SLOTS_DIR'

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

export function getBrokerUrl(): URL {
    return new URL(requiredEnv(BROKER_URL))
}

export function optionalBrokerUrl(): URL | undefined {
    const url = optionalEnv(BROKER_URL)
    if (url) return new URL(url)
}

export function optionalParentBrokerUrl(): URL | undefined {
    const url = optionalEnv(PARENT_BROKER_URL)
    if (url) return new URL(url)
}

export function getFindUrl(): URL {
    return new URL(requiredEnv(FIND_URL))
}

export function getStorageUrl(): URL {
    return new URL(requiredEnv(STORAGE_URL))
}

export function getStorageDirectory(defaultDir?: string): string {
    return optionalEnv(STORAGE_DIRECTORY) ?? defaultDir ?? __dirname
}

export function getSlotsUrl(): URL {
    return new URL(requiredEnv(SLOTS_URL))
}

export function getSlotsDirectory(): string {
    return optionalEnv(SLOTS_DIRECTORY) || __dirname
}
