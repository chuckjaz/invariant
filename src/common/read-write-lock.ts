export class ReadWriteLock {
    private currentReadLocks =  0
    private writeLockPending = false
    private currentReadPromise = resolvedPromise
    private currentReadResolve = nullResolve
    private currentWritePromise = resolvedPromise
    private currentWriteResolve = nullResolve

    async readLock() {
        if (this.currentReadLocks == 0) {
            this.currentReadPromise = new Promise((resolve, _) => this.currentReadResolve = resolve)
            while (this.writeLockPending) await this.currentWritePromise
        }
        this.currentReadLocks++
    }

    readUnlock() {
        if (--this.currentReadLocks <= 0) this.currentReadResolve(undefined)
    }

    async writeLock() {
        this.writeLockPending = true
        this.currentWritePromise = new Promise((resolve, _) => this.currentWriteResolve = resolve)
        while (this.currentReadLocks > 0) await this.currentReadPromise
    }

    writeUnlock() {
        this.writeLockPending = false
        this.currentWriteResolve(undefined)
    }
}

const resolvedPromise = Promise.resolve(undefined)
const nullResolve: (value: undefined) => void = () => { }