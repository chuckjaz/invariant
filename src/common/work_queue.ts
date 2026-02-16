export class WorkQueue<T> {
    private waiting: ((resolver: T) => void)[] = []
    private buffer: T[] = []
    private empties: (() => void)[] = []

    push(item: T) {
        if (this.waiting.length > 0) {
            const waiter = this.waiting.shift()!!
            waiter(item)
        } else {
            this.buffer.push(item)
        }
    }

    pop(): Promise<T> {
        if (this.buffer.length > 0) {
            const item = this.buffer.shift()!!
            return new Promise<T>((resolver) => resolver(item))
        } else {
            // Notify empty listeners
            const e = this.empties
            this.empties = []
            for (const n of e) { n() }

            // Return a promise for a task.
            return new Promise<T>((resolver) => this.waiting.push(resolver))
        }
    }

    waitEmpty(): Promise<void> {
        let resolver: () => void = () => { }
        const promise = new Promise<void>((r) => resolver = r)
        if (this.buffer.length <= 0) resolver();
        else this.empties.push(resolver)
        return promise
    }
}

