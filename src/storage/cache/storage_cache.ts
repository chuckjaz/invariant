import { randomBytes } from 'node:crypto'
import { Data, ManagedStorageClient, StorageClient } from "../client";
import { Lru } from '../../common/lru';
import { measureTransform, splitStream } from '../../common/data';

export class StorageCache implements StorageClient {
    private id = randomBytes(32).toString('hex')
    private writeThrough: StorageClient
    private backingStore: ManagedStorageClient
    private lru = new Lru<string>()
    private sizes = new Map<string, number>()
    private limit: number
    private currentSize: number = 0
    private evictionFrequency: number
    private stopped = false

    constructor(
        writeThrough: StorageClient,
        backingStorage: ManagedStorageClient,
        limit: number = 100 * 1024 * 1024,
        evictionFrequency: number = 1000
    ) {
        this.writeThrough = writeThrough
        this.backingStore = backingStorage
        this.limit = limit
        this.evictionFrequency = evictionFrequency
        this.scheduleBackingRead()
    }

    async ping(): Promise<string | undefined> {
        return this.id
    }

    async get(address: string): Promise<Data | false> {
        const known = this.lru.has(address)
        if (known) this.lru.update(address)
        if (known && await this.backingStore.has(address))
            return this.backingStore.get(address)
        const data = await this.writeThrough.get(address)
        if (data) {
            const [writeThroughData, backingData] = splitStream(data)
            this.remember(backingData, address)
            return writeThroughData
        }
        return false
    }

    async has(address: string): Promise<boolean> {
        if (this.lru.has(address)) {
            this.lru.update(address)
            return true
        }
        return await this.backingStore.has(address) || await this.writeThrough.has(address)
    }

    async put(address: string, data: Data): Promise<boolean> {
        const known = this.lru.has(address)
        if (known) return true
        if (await this.writeThrough.has(address)) {
            this.remember(data)
            return true
        }
        const [writeThroughData, backingStoreData] = splitStream(data)
        this.remember(backingStoreData, address)
        return this.writeThrough.put(address, writeThroughData)
    }

    async post(data: Data): Promise<string | false> {
        const [writeThroughData, backingStoreData] = splitStream(data)
        this.remember(backingStoreData)
        return await this.writeThrough.post(writeThroughData)
    }

    async fetch(): Promise<boolean> {
        return false
    }

    whenIdle(): Promise<undefined> {
        if (this.stopped || this.pendingTasks.size == 0) {
            return Promise.resolve(undefined)
        }
        const idlePromise = this.idlePromise
        if (idlePromise) {
            return idlePromise
        }
        const newIdlePromise = new Promise<undefined>(resolve => this.idleResolve = resolve)
        this.idlePromise = newIdlePromise
        return newIdlePromise
    }

    stop() {
        this.stopped = this.stopped
        for (const task of this.pendingTasks.values()) {
            clearTimeout(task.timeout)
            task.timeout = undefined
        }
        const idleResolve = this.idleResolve
        if (idleResolve) {
            idleResolve(undefined)
            this.idleResolve = undefined
        }
    }

    private offsetSize(delta: number) {
        this.currentSize += delta
        if (this.currentSize > this.limit) {
            this.scheduleEviction()
        }
    }

    private async remember(data: Data, address?: string) {
        const sizeBox = { size: 0 }
        const measured = measureTransform(data, sizeBox)
        let remembered = false
        if (address) {
            remembered = await this.backingStore.put(address, measured)
        } else {
            const result = await this.backingStore.post(measured)
            if (result) {
                address = result
                remembered = true
            }
        }
        if (remembered && address && !this.lru.has(address)) {
            this.lru.add(address)
            this.sizes.set(address, sizeBox.size)
            this.offsetSize(sizeBox.size)
        }
    }

    private async scheduleBackingRead() {
        this.scheduleTask(this.backingReadTask, 0)
    }

    private backingReadTask = async () => {
        for await (const block of this.backingStore.blocks()) {
            if (!this.lru.has(block.address)) {
                this.lru.add(block.address, block.lastAccess)
                this.sizes.set(block.address, block.size)
                this.offsetSize(block.size)
            }
        }
    }

    private scheduleEviction() {
        this.scheduleTask(this.evictionTask, this.evictionFrequency, () => this.currentSize > this.limit)
    }

    private evictionTask = async () => {
        const last = this.lru.least()
        if (!last) {
            return
        }
        const size = this.sizes.get(last)
        if (size !== undefined) {
            const forgotten = await this.backingStore.forget(last)
            if (forgotten) {
                this.lru.remove(last)
                this.currentSize -= size
            }
        } else {
            this.lru.update(last)
        }
    }

    private pendingTasks = new Map<() => Promise<void>, TaskTracker>()
    private async scheduleTask(task: () => Promise<void>, timeout: number,  condition?: () => boolean) {
        if (this.pendingTasks.has(task)) {
            return
        }
        const tracker = new TaskTracker(task)
        this.pendingTasks.set(task, tracker)
        const myId = tracker.id
        if (!condition || condition()) {
            tracker.timeout = setTimeout(async () => {
                await tracker.run()
                this.pendingTasks.delete(tracker.task)
                if (condition && condition()) {
                    this.scheduleTask(task, timeout, condition)
                }
                this.checkIdle()
            }, timeout)
        }
    }

    private idlePromise?: Promise<undefined>
    private idleResolve?: (value: undefined) => void

    private checkIdle() {
        if (this.pendingTasks.size == 0) {
            const idleResolve = this.idleResolve
            if (idleResolve) {
                idleResolve(undefined)
                this.idlePromise = undefined
                this.idleResolve = undefined
            }
        }
    }
}

let nextTaskId = 0
class TaskTracker {
    task: () => Promise<void>
    promise: Promise<undefined>
    resolve: (value: undefined) => void
    timeout?: NodeJS.Timeout
    id = nextTaskId++

    constructor(task: () => Promise<void>) {
        this.task = task
        this.resolve = () => { }
        this.promise = new Promise<undefined>(resolve => this.resolve = resolve)
    }

    async run(): Promise<void> {
        await this.task()
        this.resolve(undefined)
    }

    whenComplete(): Promise<undefined> {
        return this.promise
    }
}