interface PromisePair<T> {
    resolve: (value: IteratorResult<T>) => void
    reject: (value?: any) => void
}

export class Channel<T> {
    private buffer: T[] = []
    private receivePairs: PromisePair<T>[] = []
    private sendWaiters: ((value: undefined | PromiseLike<undefined>) => void)[] = []
    private _closed: boolean = false
    private size?: number

    constructor(size?: number) {
        this.size = size
    }

    get closed() { return this._closed }

    async send(value: T) {
        if (this._closed) return
        if (this.receivePairs.length > 0) {
            const pair = this.receivePairs.shift()!!
            pair.resolve({ done: false, value })
        } else {
            if (this.size && this.buffer.length >= this.size) {
                const waiter = new Promise<undefined>(resolve => this.sendWaiters.push(resolve))
                await waiter
            }
            this.buffer.push(value)
        }
    }

    close() {
        if (!this._closed) {
            this._closed = true
            for (const pair of this.receivePairs) {
                pair.resolve({ done: true, value: undefined })
            }
        }
    }

    receive(): Promise<IteratorResult<T>> {
        if (this.buffer.length > 0) {
            const value = this.buffer.shift()!!
            if (this.sendWaiters.length > 0) {
                const resolve = this.sendWaiters.shift()
                if (resolve) resolve(void 0);
            }
            return new Promise<IteratorResult<T>>(resolve => resolve({  done: false, value }))
        } else {
            if (this._closed) {
                return new Promise<IteratorResult<T>>(resolve => resolve({ done: true, value: undefined }))
            } else {
                return new Promise<IteratorResult<T>>((resolve, reject) => this.receivePairs.push({ resolve, reject }))
            }
        }
    }

    all(): AsyncIterable<T> {
        const me = this
        return {
            [Symbol.asyncIterator]() {
                return {
                    next() {
                        return me.receive() 
                    },
                    return() {
                        me._closed = true
                        return me.receive() 
                    },
                    async throw(e?: any): Promise<IteratorResult<T>> {
                        me._closed = true
                        for (const pair of me.receivePairs) {
                            pair.reject(e)
                        }
                        me.receivePairs.length = 0
                        return { done: true, value: undefined }
                    }
                }
            }
        }
    }
}