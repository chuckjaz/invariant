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
