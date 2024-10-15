import { isStorage, isStorageLayer, Storage, StorageLayer, StorageLayerEntry } from "./distribute_types";

export class StorageLayers {
    root: StorageLayer = { level: 0, entries: [] }

    add(storage: Storage) {
        this.addTo(storage, this.root)
    }

    find(id: Buffer) {
        function findIn(layer: StorageLayer): Storage | undefined {
            const index = id.at(layer.level)!!
            const entry = layer.entries[index]
            if (!entry) return undefined;
            if (isStorageLayer(entry)) return findIn(entry);
            if (entry.id == id) return entry
            return undefined
        }
        return findIn(this.root)
    }

    remove(id: Buffer) {
        function removeFrom(layer: StorageLayer) {
            const index = id.at(layer.level)!!
            const entry = layer.entries[index]
            if (!entry) return
            if (isStorageLayer(entry)) return removeFrom(entry);
            if (entry.id == id) layer.entries[index] = undefined
        }
        removeFrom(this.root)
    }

    findNearestActive(id: Buffer, size: number): Storage[] {
        const result: Storage[] = []

        function findIn(count: number, layer: StorageLayer): number {
            if (count <= 0) return 0
            let found = 0
            const index = id.at(layer.level)!!
            const entry = layer.entries[index]

            function emitEntry(entry: Storage | StorageLayer) {
                if (entry) {
                    if (isStorage(entry) && entry.active) {
                        result.push(entry)
                        found++
                    } else if (isStorageLayer(entry)) {
                        found += findIn(count, entry)
                    }
                }
            }

            if (entry) emitEntry(entry)
            for (let lower = index - 1, higher = index + 1; (lower >=0 || higher < 256) && found < count; lower--, higher++) {
                const lowerEntry = layer.entries[lower]
                if (lowerEntry) emitEntry(lowerEntry)
                const higherEntry = layer.entries[higher]
                if (higherEntry) emitEntry(higherEntry)
            }
            return found
        }

        findIn(size, this.root)
        result.sort((a, b) => compareDistance(id, a.id, b.id))
        if (result.length > size) return result.slice(0, size)
        return result
    }

    private addTo(storage: Storage, layer: StorageLayer) {
        const level = layer.level
        const index = storage.id.at(level)!!
        const entries = layer.entries
        const entry = entries[index]

        function recordStorage(item: StorageLayer | Storage, index: number, entries: StorageLayerEntry[]) {
            entries[index] = item
        }

        if (entry === undefined) {
            recordStorage(storage, index, entries)
        } else if (isStorage(entry)) {
            // Convert entry into a layer
            const newLayer: StorageLayer = {
                level: layer.level + 1,
                entries: []
            }
            recordStorage(newLayer, index, entries)
            this.addTo(entry, newLayer)
            this.addTo(storage, newLayer)
        } else {
            this.addTo(storage, entry)
        }
    }
}

function compareDistance(id: Buffer, a: Buffer, b: Buffer): number {
    for (let i = 0, len = id.length; i < len; i++) {
        const ab = a.at(i)!!
        const bb = b.at(i)!!
        if (ab == bb) continue
        const ib = id.at(i)!!
        const ad = Math.abs(ib - ab)
        const bd = Math.abs(ib - bb)
        if (ad > bd) return 1;
        return -1
    }
    return 0
}