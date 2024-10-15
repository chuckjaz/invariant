export type ParallelItem = (schedule: (...items: ParallelItem[]) => void) => Promise<unknown>

export class ParallelContext {
    private parallel: number
    private running: Map<any, Promise<void>> = new Map()
    private pending: ParallelItem[] = []
    private resolve: (value: any) => void = () => {}
    private reject: (value: any) => void = () => {}

    private joinPromise = new Promise<void>((resolve, reject) => {
        this.resolve = resolve
        this.reject = reject
    })

    constructor(parallel: number = 100) {
        this.parallel = parallel
    }

    add(...items: ParallelItem[]) {
        for (const item of items) {
            if (this.parallel > 0) {
                this.schedule(item)
            } else {
                this.pending.push(item)
            }
        }
    }

    run<T>(task: () => Promise<T>): Promise<T> {
        let resolve: (value: T) => void = () => {}
        let reject: (value: any) => void = () => {}
        let promise = new Promise<T>((rs, rj) => { resolve = rs; reject = rj })
        this.add(async () => task().then(resolve).catch(reject))
        return promise
    }

    async map<E, R>(items: Iterable<E> | AsyncIterable<E>, cb: (item: E, index: number, schedule: (...items: E[]) => void) => Promise<R>): Promise<R[]> {
        const result: (R | undefined)[] = []
        let resolve: (value: R[]) => void = () => {}
        let reject: (value: any) => void = () => {}
        let rejected = false
        let pending = 0
        const promise = new Promise<R[]>((rslv, rjct) => { resolve = rslv; reject = rjct })

        const addItems =  (...items: E[]) => {
            for (const item of items) {
                if (rejected) break
                const index = result.push(undefined) - 1
                pending++
                this.add(async () => {
                    if (rejected) return
                    try {
                        result[index] = await cb(item, index, addItems)
                        pending--
                    } catch (e) {
                        rejected = true
                        reject(e)
                    }
                    if (pending == 0) resolve(result as R[])
                })
            }
            if (pending == 0 && result.length == 0) resolve([])
        }

        if (Symbol.iterator in items) {
            addItems(...items)
        } else {
            for await (const item of items) {
                addItems(item)
            }
        }
        return promise
    }

    private schedule(item: ParallelItem) {
        const key = {}
        this.parallel--
        this.running.set(key, (async () => {
            await item(this.add.bind(this))
            this.running.delete(key)
            if (this.pending.length > 0) {
                this.schedule(this.pending.shift()!!)
            } else {
                this.parallel++
                if (this.running.size == 0) {
                    this.resolve(undefined)
                    this.resolve = () => {}
                }
            }
        })().catch(e => this.reject(e)))
    }

    join(): Promise<void> {
        if (this.pending.length == 0 && this.running.size == 0) this.resolve(undefined)
        return this.joinPromise
    }
}

