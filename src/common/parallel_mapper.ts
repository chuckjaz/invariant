export class ParallelMapper<C, R> {
    private parallel: number
    private mapper: (value: C, schedule: (item: C) => void) => Promise<R>
    private pending: C[] = []
    private running: Map<any, Promise<void>> = new Map()
    private results: R[] = []
    private resolve: (value: R[] | PromiseLike<R[]>) => void = () => {}
    private reject: (reason?: any) => void = () => {}
    private promise: Promise<R[]> = new Promise((resolve, reject) => {
        this.resolve = resolve
        this.reject = reject
    })

    constructor(mapper: (value: C, schedule: (item: C) => void) => Promise<R>, parallel: number = 20) {
        this.parallel = parallel
        this.mapper = mapper
    }

    add(...items: C[]) {
        for (const item of items) {
            if (this.parallel > 0) {
                this.schedule(item)
            } else {
                this.pending.push(item)
            }
        }
    }

    collect(): Promise<R[]> {
        if (this.running.size == 0 && this.pending.length == 0) {
            this.resolve([])
        }
        return this.promise.then(a => a)
    }

    private schedule(item: C) {
        const key = {}
        this.parallel--
        this.running.set(key, (async () => {
            const result = await this.mapper(item, this.add.bind(this))
            this.results.push(result)
            this.running.delete(key)
            if (this.pending.length > 0) {
                this.schedule(this.pending.shift()!!)
            } else {
                this.parallel++
                if (this.running.size == 0) {
                    this.resolve(this.results)
                    this.resolve = () => {}
                }
            }
        })().catch(e => this.reject(e)))
    }
}
