import { Converter } from "./web"

export function normalizeCode(hexBytes: string | undefined): string | undefined {
    if (hexBytes === undefined) return undefined
    if (hexBytes.length == 32 * 2) {
        try {
            const hashBytes = Buffer.from(hexBytes, 'hex')
            return hashBytes.toString('hex')
        } catch { }
    }
    return undefined
}

export const codeConverter: Converter<string> = (value: string | string[] | undefined) => {
    if (typeof value === 'string') {
        return normalizeCode(value)
    }
}
