export class InvalidRequest extends Error {
    status = 400
    constructor(msg: string) {
        super(msg)
    }
}

export function invalid(msg: string): never {
    throw new InvalidRequest(msg)
}

export function error(msg: string): never {
    throw new Error(msg)
}
