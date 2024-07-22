export function normalizeCode(hexBytes: string): string | undefined {
    if (hexBytes.length == 32 * 2) {
        try {
            const hashBytes = Buffer.from(hexBytes, 'hex')
            return hashBytes.toString('hex')
        } catch { }
    } 
    return undefined
}
