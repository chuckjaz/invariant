export class InvalidRequest extends Error {
    status: number
    constructor(msg: string, status: number = 400) {
        super(msg)
        this.status = status
    }
}

export function invalid(msg: string, status?: number): never {
    throw new InvalidRequest(msg, status)
}

export function error(msg: string): never {
    throw new Error(msg)
}
