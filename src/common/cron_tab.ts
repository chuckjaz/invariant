import { ParamName } from "@koa/router"

export class CronTab {
    private pending: Task[] = []
    private map = new Map<() => Promise<void>, Task>()
    private handle: NodeJS.Timeout | undefined = undefined
    private stopped = false

    request(duration: number, task: () => Promise<void>) {
        this.stopClock()
        this.schedule(duration, task)
    }

    every(frequence: number, task: () => Promise<void>) {
        this.schedule(frequence, task, frequence)
    }

    cancel(task: () => Promise<void>) {
        const taskItem = this.map.get(task)
        if (taskItem) {
            this.stopClock()
            this.removeTask(taskItem)
            this.startClock()
        }
    }

    stop() {
        if (!this.stopped) {
            this.stopClock()
            this.stopped = true
        }
    }

    private run() {
        try {
            this.handle = undefined
            const pending = this.pending
            const task = pending[0]
            const now = Date.now()
            if (task.deadline <= now) {
                this.removeTask(task)
                task.task().then(() => {
                    if (task.frequency) {
                        this.stopClock()
                        task.deadline = Date.now() + task.frequency
                        task.index = pending.length
                        pending.push(task)
                        this.reschedule(task)
                        this.startClock()
                    }
                }).catch(e => console.error("Cron task failed", e))
            }
            this.startClock()
        } catch (e) {
            console.error("error", e)
        }
    }

    private startClock() {
        if (this.handle || this.stopped) return
        const pending = this.pending
        if (pending.length > 0) {
            const now = Date.now()
            const task = pending[0]
            const duration = nonNeg(task.deadline - now)
            this.handle = setTimeout(this.run.bind(this),  duration)
        }
    }

    private stopClock() {
        const handle = this.handle
        if (handle) {
            clearTimeout(this.handle)
            this.handle = undefined
        }
    }

    private schedule(duration: number, task: () => Promise<void>, frequency?: number) {
        this.stopClock()
        const now = Date.now()
        const deadline = now + duration
        let taskItem = this.map.get(task)
        if (!taskItem) {
            const pending = this.pending
            taskItem = {
                task,
                deadline,
                frequency,
                index: pending.length
            }
            pending.push(taskItem)
        } else {
            taskItem.deadline = deadline
        }
        this.reschedule(taskItem)
        this.startClock()
    }

    private reschedule(task: Task) {
        this.shiftUp(task.index)
        this.shiftDown(task.index)
    }

    private removeTask(task: Task) {
        const pending = this.pending
        const lastTask = pending[pending.length - 1]
        this.swap(task.index, lastTask.index)
        pending.pop()
        if (pending.length > 0) {
            this.shiftUp(lastTask.index)
            this.shiftDown(lastTask.index)
        }
    }

    private swap(i: number, j: number) {
        const pending = this.pending
        const it = pending[i]
        const jt = pending[j]
        pending[j] = it
        it.index = j
        pending[i] = jt
        jt.index = i
    }

    private shiftUp(i: number) {
        const pending = this.pending
        const it = pending[i]
        const id = it.deadline
        while (i > 0) {
            const parentIndex = Math.floor((i + 1) / 2) - 1
            const parent = pending[parentIndex]
            if (id < parent.deadline) {
                this.swap(i, parentIndex)
                i = parentIndex
            } else break
        }
    }

    private shiftDown(i: number) {
        const pending = this.pending
        const limit = Math.floor(pending.length / 2)
        const it = pending[i]
        const id = it.deadline
        while (i < limit) {
            const rightIndex = (i + 1) * 2
            const leftIndex = rightIndex - 1
            const rt = pending[rightIndex]
            const lt = pending[leftIndex]
            if (lt.deadline < id && (!rt || lt.deadline < rt.deadline)) {
                this.swap(i, leftIndex)
                i = leftIndex
            } else if (rt && rt.deadline < id) {
                this.swap(i, rightIndex)
                i = rightIndex
            } else break
        }
    }
}

interface Task {
    task: () => Promise<void>
    deadline: number
    index: number
    frequency?: number
}

function nonNeg(value: number): number {
    return value < 0 ? 0 : value
}

