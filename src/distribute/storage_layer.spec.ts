import { arr } from "../common/arr"
import { Storage } from "./distribute_types"
import { StorageLayers } from "./storage_layer"
import { randomBytes } from "node:crypto"

describe("distribute/storage_layer", () => {
    it("can create a storage layer", () => {
        const layer = new StorageLayers()
        expect(layer).toBeDefined()
    })
    it("can add a storage declaration", () => {
        const layer = new StorageLayers()
        const storage = newStorage()
        layer.add(storage)
        const foundStorage = layer.find(storage.id)
        expect(foundStorage).toBe(storage)
    })
    it("can add 100 storages", () => {
        const layer = new StorageLayers()
        const storages = arr(100, newStorage)
        storages.forEach(storage => layer.add(storage))
        storages.forEach(storage => {
            const foundStorage = layer.find(storage.id)
            expect(foundStorage).toBe(storage)
        })
    })
    it("can add 10000 storages", () => {
        const layer = new StorageLayers()
        const storages = arr(10000, newStorage)
        storages.forEach(storage => layer.add(storage))
        storages.forEach(storage => {
            const foundStorage = layer.find(storage.id)
            expect(foundStorage).toBe(storage)
        })
    })
    it("can find the nearest storages", () => {
        const layer = new StorageLayers()
        const storages = arr(10000, newStorage)
        storages.forEach(storage => layer.add(storage))
        const id = randomBytes(32)
        const nearest = layer.findNearestActive(id, 3)
        expect(nearest.length).toEqual(3)
        const set = new Set(nearest)
        expect(set.size).toEqual(3)
    })
})

function newStorage(): Storage {
    const id = randomBytes(32)
    return {
        refCount: 1,
        id,
        blocks: [],
        active: true
    }
}
