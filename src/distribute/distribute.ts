import { BrokerClient } from "../broker/broker_client";
import { normalizeCode } from "../common/codes";
import { invalid } from "../common/errors";
import { randomId } from "../common/id";
import { ParallelContext } from "../common/parallel_context";
import { Logger } from "../common/web";
import { WorkQueue } from "../common/work_queue";
import { findStorage } from "../file-tree/file-tree";
import { FindClient, HasListener } from "../find/client";
import { ManagedStorageClient, StorageClient } from "../storage/storage_client";
import { DistributeClient } from "./distribute_client";
import { Block, Storage, StorageState } from "./distribute_types";
import { StorageLayers } from "./storage_layer";

export class Distribute implements DistributeClient, HasListener {
    broker: BrokerClient
    id: string
    storageLayers = new StorageLayers()
    manifests = new Map<string, Manifest>()
    tasks = new WorkQueue<DistributeTask>()
    parallel = new ParallelContext()
    blockMap = new Map<string, Block>()
    _finder?: FindClient
    n: number
    logger?: Logger
    workerPromise: Promise<void>

    constructor (broker: BrokerClient, id?: string, n: number = 3, finder?: FindClient, logger?: Logger) {
        this.broker = broker
        this.id = id ?? randomId()
        this._finder = finder
        this.n = n
        this.logger = logger
        this.workerPromise = this.taskWorker()
    }

    async ping(): Promise<string | undefined> {
        return this.id
    }

    async close(): Promise<void> {
        this.requestStop()
        return this.workerPromise
    }

    async register(storageId: string): Promise<void> {
        this.log(`REGISTERING: ${storageId}`)
        const id = Buffer.from(storageId, 'hex')
        const storage = this.storageLayers.find(id)
        if (!storage) {
            const newStorage: Storage = {
                state: StorageState.Registering,
                id,
                blocks: [],
            }
            this.storageLayers.add(newStorage)
            this.requestPingStorage(newStorage)
        }
    }

    async unregister(storageId: string): Promise<void> {
        this.log(`UNREGISTERING: ${storageId}`)
        const id = Buffer.from(storageId, 'hex')
        const storage = this.storageLayers.find(id)
        if (storage) {
            this.storageLayers.remove(id)
            this.requestRebalanceBlocks()
        }
    }

    async has(container: string, ids: string[]): Promise<boolean> {
        const id = Buffer.from(container, 'hex')
        const storage = this.storageLayers.find(id)
        let effectiveStorage: Storage | undefined = undefined
        if (storage) {
            effectiveStorage = storage
        } else {
            effectiveStorage = {
                state: StorageState.Provisional,
                id: Buffer.from(container),
                blocks: [],
            }
        }

        for (const blockId of ids) {
            this.trackBlock(blockId, effectiveStorage)
        }

        return true
    }

    async needed(storageId: string, blockId: string): Promise<boolean> {
        const id = Buffer.from(storageId, 'hex')
        const storage = this.storageLayers.find(id)
        if (!storage) invalid("Unknown storage", 404);
        const block = this.blockMap.get(normalizeCode(blockId) ?? "")
        if (!block) invalid("Unknown block", 404);
        const nearest =  this.storageLayers.findNearestActive(block.id, this.n)
        if (nearest.length < this.n) return true
        for (const s of nearest) {
            if (s === storage) return true
        }
        return false
    }

    wait(): Promise<void> {
        return new Promise<void>(resolve => this.tasks.push({ kind: DistributeTaskKind.Wait, resolve }))
    }

    private async ensureFinder(): Promise<FindClient> {
        let finder = this._finder
        if (finder) {
            if (await finder.ping()) return finder
        }
        for await (const finderId of await this.broker.registered('find')) {
            const finderClient = await this.broker.find(finderId)
            if (finderClient && await finderClient.ping()) {
                finder = finderClient
                break
            }
        }
        this._finder = finder
        if (!finder) throw new Error("Could not find a finder")
        return finder
    }

    private requestStop() {
        this.tasks.push({ kind: DistributeTaskKind.Stop })
    }

    private requestPingStorage(storage: Storage) {
        this.tasks.push({ kind: DistributeTaskKind.PingStorage, storage })
    }

    private requestReadBlocks(storage: Storage) {
        this.tasks.push({ kind: DistributeTaskKind.ReadBlocks, storage })
    }

    private rebalanceRequested = false

    private requestRebalanceBlocks() {
        if (this.rebalanceRequested) return
        this.log("Rebalance requested")
        this.tasks.push({ kind: DistributeTaskKind.RebalanceBlocks })
        this.rebalanceRequested = true
    }

    private requestMoveBlock(block: Block, from: Storage[], to: Storage[]) {
        this.tasks.push({ kind: DistributeTaskKind.MoveBlock, block, from, to })
    }

    private pendingFinderNotifications = new Map<string, string[]>()

    private requestNotifyFinder(container: string, block: string) {
        if (this.pendingFinderNotifications.size == 0) this.tasks.push({ kind: DistributeTaskKind.NotifyFinder });
        let entries = this.pendingFinderNotifications.get(container)
        if (!entries) {
            entries = []
            this.pendingFinderNotifications.set(container, entries)
        }
        entries.push(block)
    }

    private async taskWorker() {
        let pending: Promise<any>[] = []
        loop: while (true) {
            const task = await this.tasks.pop()
            switch (task.kind) {
                case DistributeTaskKind.Stop: {
                    break loop
                }
                case DistributeTaskKind.PingStorage: {
                    pending.push(this.pingStorage(task.storage))
                    break
                }
                case DistributeTaskKind.ReadBlocks: {
                    pending.push(this.readBlocks(task.storage))
                    break
                }
                case DistributeTaskKind.RebalanceBlocks: {
                    this.rebalanceRequested = false
                    await this.rebalanceBlocks()
                    break
                }
                case DistributeTaskKind.MoveBlock: {
                    pending.push(this.moveBlock(task))
                    break
                }
                case DistributeTaskKind.NotifyFinder: {
                    const notifications = this.pendingFinderNotifications
                    this.pendingFinderNotifications = new Map()
                    pending.push(this.notifyFinder(notifications))
                    break
                }
                case DistributeTaskKind.Wait: {
                    const tasks = this.tasks
                    async function wait(resolver: () => void) {
                        while (pending.length > 0) {
                            // Wait for the current pending calls to complete
                            const waiting = pending
                            pending = []
                            await Promise.all(waiting)

                            // Wait for all the tasks to complete which may schedule more calls
                            await tasks.waitEmpty()
                        }
                        resolver()
                    }
                    wait(task.resolve)
                }
            }
        }
    }

    private async pingStorage(storage: Storage) {
        if (storage.state == StorageState.Provisional) return
        const idText = storage.id.toString('hex')
        this.log(`PING: ${idText}`)
        const storageClient = await this.broker.storage(idText)
        if (!storageClient || !(await storageClient.ping())) {
            if (storage.state == StorageState.Active) {
                this.requestRebalanceBlocks();
                return
            }
            storage.state = StorageState.Inactive
            this.log(`INACTIVE: ${idText}`)
            return
        }
        if (storage.state != StorageState.Active) {
            this.log(`ACTIVATE: ${idText}`)

            const registering = storage.state == StorageState.Registering
            storage.state = StorageState.Active
            this.requestRebalanceBlocks();
            if (registering) this.requestReadBlocks(storage)
        }
    }

    private async readBlocks(storage: Storage) {
        if (storage.state == StorageState.Provisional) return
        const idText = storage.id.toString('hex')
        this.log(`READ BLOCKS: ${idText}`)
        const storageClient = await this.broker.storage(idText)
        if (!storageClient) return
        const managed = storageClient as ManagedStorageClient
        for await (const block of managed.blocks()) {
            this.log(`TRACKING: ${block}`)
            this.trackBlock(block.address, storage)
        }
        this.log(`DONE BLOCKS: ${idText}`)
    }

    private async rebalanceBlocks() {
        this.log('REBALANCE START')
        for (const [_, block] of this.blockMap.entries()) {
            const nearest =  this.storageLayers.findNearestActive(block.id, this.n)
            if (!areEffectivelyEqual(block.stores, nearest)) {
                this.log(`Moving block: ${block.id.toString('hex')}: ${block.stores.map(s => s.id.toString('hex'))} -> ${nearest.map(s => s.id.toString('hex'))}`)
                this.requestMoveBlock(block, block.stores, nearest)
                block.stores = nearest
            }
        }
        this.log('REBALANCE DONE')
    }

    private async moveBlock(task: MoveBlock) {
        // Find the destinations that don't already have the block
        const id = task.block.id.toString('hex')
        const destPromise = this.parallel.map(task.to, async storage => {
            const storageId = storage.id.toString('hex')
            if (storage.state == StorageState.Active) {
                const storageClient = await this.broker.storage(storageId)
                if (!storageClient) {
                    this.log(`Couldn't find storage ${storageId}`)
                    return [storageId, undefined]
                }
                if (await storageClient.has(id)) {
                    this.log(`storage ${storageId} 'already has ${id}`)
                    return [storageId, undefined]
                }
                return [storageId, storageClient]
            }
            this.log(`Storage not active ${storageId}`)
            return [storageId, undefined]
        })

        // Find the sources that have the block
        const sourcePromise = this.parallel.map(task.from, async storage => {
            const storageId = storage.id.toString('hex')
            const candidate = await this.broker.storage(storageId)
            if (!candidate) return [id, undefined]
            if (!await candidate.has(storageId)) return [id, undefined]
            return [storageId, candidate]
        })

        const dest = (await destPromise).filter(i => i[1]) as [string, StorageClient][]
        let source = (await sourcePromise).filter(i => i[1]) as [string, StorageClient][]
        if (dest.length == 0) {
            this.log(`No live destinations for ${id}`)
            return
        }
        if (source.length == 0) {
            const foundSource = await findStorage(id, await this.ensureFinder(), this.broker)
            const foundSourceId = foundSource ? await foundSource.ping() : undefined
            if (foundSource && foundSourceId) {
                source = [[foundSourceId, foundSource]]
            }
        }
        if (source.length == 0) {
            // Try known storages
            for (const storageIdBuffer of this.storageLayers.knownStorages()) {
                const storageId = storageIdBuffer.toString('hex')
                const storage = await this.broker.storage(storageId)
                if (storage && await storage.has(id)) {
                    source.push([storageId, storage])
                }
            }
        }
        if (source.length == 0) {
            this.log(`Block ${id} could not be found`)
            return
        }

        // Round-robin the sources to copy to the destinations
        let sourceIndex = 0
        const promises: Promise<unknown>[] = []
        for (const destinationStorage of dest) {
            const sourceStorage = source[sourceIndex++]; sourceIndex = sourceIndex % source.length
            promises.push(this.parallel.run(async () => {
                const destinationClient = destinationStorage[1]
                this.log(`MOVE: FETCH ${id}`)
                if (!await destinationClient.fetch(id, sourceStorage[0])) {
                    this.log('MOVE: FETCH FAILED, trying get/put')
                    const sourceClient = sourceStorage[1]
                    const data = await sourceClient.get(id)
                    if (!data) {
                        this.log(`Storage ${sourceStorage[0]} said it had ${id} but return false to get`)
                        return
                    }
                    await destinationClient.put(id, data)
                }

                // Notify the finder of the block's new location
                this.requestNotifyFinder(destinationStorage[0], id)
            }))
        }
        await Promise.all(promises)
    }

    private trackBlock(blockId: string, storage: Storage) {
        // Track the block if it is not tracked already.
        let block = this.blockMap.get(blockId)
        const storageId = storage.id.toString('hex')
        if (!block) {
            this.log(`TRACK: NEW ${blockId} -> ${storageId}}`)
            const newBlock: Block = {
                id: Buffer.from(blockId, 'hex'),
                stores: [storage]
            }
            this.blockMap.set(blockId, newBlock)
            this.requestRebalanceBlocks()
            this.requestNotifyFinder(storageId, blockId)
        } else {
            if (block.stores.indexOf(storage) < 0) {
                block.stores.push(storage)
                this.requestNotifyFinder(storageId, blockId)
            }
        }
    }

    private async notifyFinder(notifications: Map<string, string[]>) {
        const finder = await this.ensureFinder()
        for (const [container, blocks] of notifications.entries()) {
            await finder.has(container, blocks)
        }
    }

    private async log(msg: string) {
        const logger = this.logger
        if (logger) logger(msg)
    }
}

interface Manifest {
    refCount: number
    blocks: string[]
}

enum DistributeTaskKind {
    PingStorage = "PingStorage",
    Stop = "Stop",
    RebalanceBlocks = "RebalanceBlocks",
    MoveBlock = "MoveBlock",
    NotifyFinder = "NotifyFinder",
    ReadBlocks = "ReadBlocks",
    Wait = "Wait",
}

type DistributeTask = PingStorage | Stop | RebalanceBlocks | MoveBlock | NotifyFinder | ReadBlocks | Wait

interface PingStorage {
    kind: DistributeTaskKind.PingStorage
    storage: Storage
}

interface Stop {
    kind: DistributeTaskKind.Stop
}

interface RebalanceBlocks {
    kind: DistributeTaskKind.RebalanceBlocks
}

interface MoveBlock {
    kind: DistributeTaskKind.MoveBlock
    block: Block
    from: Storage[]
    to: Storage[]
}

interface NotifyFinder {
    kind: DistributeTaskKind.NotifyFinder
}

interface ReadBlocks {
    kind: DistributeTaskKind.ReadBlocks
    storage: Storage
}

interface Wait {
    kind: DistributeTaskKind.Wait
    resolve: () => void
}

function areEffectivelyEqual<T>(a: T[], b: T[]): boolean {
    if (a.length != b.length) return false
    next: for (const aa in a) {
        for (const bb in b) {
            if (aa == bb) continue next
        }
        return false
    }
    return true
}
