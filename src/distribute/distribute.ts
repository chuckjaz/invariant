import { BrokerClient } from "../broker/broker_client";
import { randomId } from "../common/id";
import { ParallelContext } from "../common/parallel_context";
import {
    DistributorPutPinRequest,
    DistributorPutUnpinRequest,
    DistributorPutRegisterStorage,
    DistributorPutUnregisterStorage,
    DistributorPostBlocksRequest,
    DistributorPostBlocksResponse
} from "../common/types";
import { Logger } from "../common/web";
import { WorkQueue } from "../common/work_queue";
import { findStorage } from "../file-tree/file-tree";
import { FindClient } from "../find/client";
import { StorageClient } from "../storage/storage_client";
import { DistributeClient } from "./distribute_client";
import { Block, Storage } from "./distribute_types";
import { StorageLayers } from "./storage_layer";

export class Distribute implements DistributeClient {
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

    async pin(request: DistributorPutPinRequest): Promise<void> {
        for await (const blockId of request) {
            this.log(`PINNING: ${blockId}`)
            const block = this.blockMap.get(blockId)
            if (!block) {
                const newBlock: Block = {
                    refCount: 1,
                    id: Buffer.from(blockId, 'hex'),
                    stores: []
                }
                this.blockMap.set(blockId, newBlock)
                this.requestRebalanceBlocks()
            } else {
                block.refCount++
            }
        }
    }

    async unpin(request: DistributorPutUnpinRequest): Promise<void> {
        for await (const blockId of request) {
            this.log(`UNPINNING: ${blockId}`)
            const block = this.blockMap.get(blockId)
            if (block) {
                const ref = --block.refCount
                if (ref == 0) {
                    this.blockMap.delete(blockId)
                }
            }
        }
    }

    async register(request: DistributorPutRegisterStorage): Promise<void> {
        for await (const storageId of request) {
            this.log(`REGISTERING: ${storageId}`)
            const id = Buffer.from(storageId, 'hex')
            const storage = this.storageLayers.find(id)
            if (storage) {
                storage.refCount++
                continue
            }
            const newStorage: Storage = {
                refCount: 1,
                id,
                blocks: [],
                active: false
            }
            this.storageLayers.add(newStorage)
            this.requestPingStorage(newStorage)
        }
    }

    async unregister(request: DistributorPutUnregisterStorage): Promise<void> {
        for await (const storageId of request) {
            this.log(`UNREGISTERING: ${storageId}`)
            const id = Buffer.from(storageId, 'hex')
            const storage = this.storageLayers.find(id)
            if (storage) {
                const ref = --storage.refCount
                if (ref <= 0) {
                    this.storageLayers.remove(id)
                    this.requestRebalanceBlocks()
                }
            }
        }
    }

    async *blocks(request: DistributorPostBlocksRequest): DistributorPostBlocksResponse {
        this.log('BLOCKS request')
        for await (const blockId of request) {
            const block = this.blockMap.get(blockId)
            if (block) {
                const storages = block.stores.map(s => s.id.toString('hex'))
                yield {
                    block: blockId,
                    storages
                }
            }
        }
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
        const pending: Promise<any>[] = []
        loop: while (true) {
            const task = await this.tasks.pop()
            switch (task.kind) {
                case DistributeTaskKind.Stop: {
                    break loop
                }
                case DistributeTaskKind.PingStorage: {
                    pending.push(this.parallel.run(() => this.pingStorage(task.storage)))
                    break
                }
                case DistributeTaskKind.RebalanceBlocks: {
                    this.rebalanceRequested = false
                    await this.rebalanceBlocks()
                    break
                }
                case DistributeTaskKind.MoveBlock: {
                    pending.push(this.parallel.run(() => this.moveBlock(task)))
                    break
                }
                case DistributeTaskKind.NotifyFinder: {
                    const notifications = this.pendingFinderNotifications
                    this.pendingFinderNotifications = new Map()
                    pending.push(this.parallel.run(() => this.notifyFinder(notifications)))
                    break
                }
                case DistributeTaskKind.Wait: {
                    await Promise.all(pending)
                    task.resolve()
                }
            }
        }
    }

    private async pingStorage(storage: Storage) {
        const idText = storage.id.toString('hex')
        const storageClient = await this.broker.storage(idText)
        if (!storageClient || !(await storageClient.ping())) {
            if (storage.active) this.requestRebalanceBlocks();
            storage.active = false
            this.log(`STORAGE: ID ${idText} is inactive`)
            return
        }
        if (!storage.active) this.requestRebalanceBlocks();
        storage.active = true
    }

    private async   rebalanceBlocks() {
        for (const [_, block] of this.blockMap.entries()) {
            const nearest =  this.storageLayers.findNearestActive(block.id, this.n)
            if (!areEffectivelyEqual(block.stores, nearest)) {
                this.log(`Moving block: ${block.id.toString('hex')}: ${block.stores.map(s => s.id.toString('hex'))} -> ${nearest.map(s => s.id.toString('hex'))}`)
                this.requestMoveBlock(block, block.stores, nearest)
                block.stores = nearest
            }
        }
    }

    private async moveBlock(task: MoveBlock) {
        // Find the destinations that don't already have the block
        const id = task.block.id.toString('hex')
        const destPromise = this.parallel.map(task.to, async storage => {
            const storageId = storage.id.toString('hex')
            if (storage.active) {
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
                if (!await destinationClient.fetch(id, sourceStorage[0])) {
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
    Wait = "Wait",
}

type DistributeTask = PingStorage | Stop | RebalanceBlocks | MoveBlock | NotifyFinder | Wait

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
