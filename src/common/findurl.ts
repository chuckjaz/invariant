import * as os from 'node:os'
import * as dns from 'node:dns/promises'

export async function findUrls(port?: number): Promise<URL[] | undefined> {
    const interfaces = os.networkInterfaces()
    let result: URL[] = []
    let addresses = new Set<string>()

    function add(address: string, best: boolean = false) {
        if (addresses.has(address)) return
        addresses.add(address)
        const url = new URL(address)
        if (port !== undefined) url.port = port.toString();
        if (best) { result.unshift(url) } else { result.push(url) }
    }

    loop: for (const interfaceName in interfaces) {
        const interfaceInfos = interfaces[interfaceName]
        if (!interfaceInfos) continue
        for (const interfaceInfo of interfaceInfos) {
            if (interfaceInfo.internal) continue
            const address = interfaceInfo.address
            const ip4 = interfaceInfo.family == 'IPv4'
            const raw  = `http://${ip4 ? address : `[${address}]`}`
            add(raw)

            // Try to name the address
            const names = await findNamesOf(address)
            for (const dnsName of names) {
                const dnsAddress = await findAddressOf(dnsName)
                if (dnsAddress == address) {
                    add(`http://${dnsName}`, ip4)
                }
            }
        }
    }
    return result.length ? result : undefined
}

async function findNamesOf(address: string): Promise<string[]> {
    try {
        return await dns.reverse(address)
    } catch(e) {
        return []
    }
}

async function findAddressOf(name: string): Promise<string | undefined> {
    try {
        const result = await dns.lookup(name)
        return result.address
    } catch(e) {
        return
    }
}