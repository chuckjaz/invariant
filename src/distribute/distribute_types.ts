export interface Block {
    id: Buffer
    stores: Storage[]
}

export enum StorageState {
    // We are were told about the server but it is not registered. This is used to
    // remember what we were told in hopes it will be registered. These may periodically be
    // discarded if the service is overloaded.
    Provisional,

    // The storage service was requested to be registered but it is in the process of being registered.
    Registering,

    // The storage service was registered and its blocks are actively being managed.
    Active,

    // The storage service was registered but has become inaccessible.
    Inactive,
}

export interface Storage {
    id: Buffer
    blocks: Block[]
    state: StorageState
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
