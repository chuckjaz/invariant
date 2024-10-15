export interface Block {
    refCount: number
    id: Buffer
    stores: Storage[]
}

export interface Storage {
    refCount: number
    id: Buffer
    blocks: Block[]
    active: boolean
}

export interface StorageLayer {
    level: number
    entries: StorageLayerEntry[]
}

export type StorageLayerEntry = undefined | StorageLayer | Storage

export function isStorage(a: any): a is Storage {
    return a && 'id' in a
}

export function isStorageLayer(a: any): a is StorageLayer {
    return a && 'entries' in a
}
