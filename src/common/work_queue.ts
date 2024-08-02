export class WorkQueue<T> {
    private waiting: ((resolver: T) => void)[] = []
    private buffer: T[] = []

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
            return new Promise<T>((resolver) => this.waiting.push(resolver))
        }
    }
}

