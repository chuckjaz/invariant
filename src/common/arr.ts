export function arr<T>(size: number, init: (index: number) => T): T[] {
    const result: T[] = []
    for (let i = 0; i < size; i++) {
        result.push(init(i))
    }
    return result
}
