export class Lru<Data> {
    data: Data[] = []
    time: number[] = []
    indexMap = new Map<Data, number>()

    has(data: Data) {
        return this.indexMap.has(data)
    }

    add(data: Data, time: number = Date.now()) {
        if (this.indexMap.has(data)) {
            this.update(data, time)
        } else {
            this.data.push(data)
            this.time.push(time)
            const index = this.time.length - 1
            this.indexMap.set(data, index)
            this.shiftUp(index)
        }
    }

    update(data: Data, time: number = Date.now()) {
        const index = this.indexMap.get(data)
        if (index === undefined) {
            this.add(data, time)
        } else {
            this.time[index] = time
            this.shift(index)
        }
    }

    least(): Data {
        return this.data[0]
    }

    remove(data: Data) {
        const indexMap = this.indexMap
        const index = indexMap.get(data)
        if (index !== undefined) {
            indexMap.delete(data)
            const time = this.time
            const d = this.data
            const last = time.length - 1
            if (last > 0) {
                time[index] = time[last]
                d[index] = d[last]
                indexMap.set(d[index], index)
                this.shift(index)
            }
            time.length = last
            d.length = last
        }
    }

    validate() {
        const data = this.data
        const time = this.time
        if (data.length != time.length) error("time and data arrays are different lengths");
        const indexMap = this.indexMap
        if (indexMap.size != data.length) error(`indexMap is the wrong length, receive ${indexMap.size}. expect ${data.length}`);
        data.forEach((item, index) => {
            const received = indexMap.get(item)
            if (received != index) error(`indexMap entry ${item} has the wrong index, expected ${index}, received ${received}`);
        })
        for (let i = 1, len = time.length; i < len; i++) {
            const parent = Math.floor((i + 1) / 2) - 1
            if (time[i] < time[parent]) error(`Inconsisten heap at ${i}`);
        }
    }

    private shift(index: number) {
        const newIndex = this.shiftUp(index)
        return this.shiftDown(newIndex)
    }

    private shiftUp(index: number) {
        let current = index
        const time = this.time
        while (current > 0) {
            const parent = Math.floor((current + 1) / 2) - 1
            if (time[current] < time[parent]) {
                this.swap(current, parent)
            } else {
                break
            }
        }
        return current
    }

    private shiftDown(index: number) {
        let time = this.time
        let len = time.length
        let limit = Math.floor(len / 2)
        let current = index
        let cTime = time[current]
        while (current < limit) {
            const l = current * 2 + 1
            const r = l + 1
            const lTime = time[l]
            const rTime = time[r]
            if (cTime > lTime && (rTime === undefined || lTime < rTime)) {
                this.swap(current, l)
                current = l
            } else if (rTime != undefined && cTime > rTime) {
                this.swap(current, r)
                current = r
            } else break
        }
        return current
    }

    private swap(i: number, j: number) {
        const data = this.data
        swap(data, i, j)
        swap(this.time, i, j)
        const indexMap = this.indexMap
        indexMap.set(data[i], i)
        indexMap.set(data[j], j)
    }
}

function swap<T>(arr: T[], i: number, j: number) {
    const t = arr[i]
    arr[i] = arr[j]
    arr[j] = t
}

function error(msg: string): never {
    throw new Error(msg)
}