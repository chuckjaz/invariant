import * as os from 'node:os'
import * as dns from 'node:dns/promises'

export async function findUrl(): Promise<URL | undefined> {
    const interfaces = os.networkInterfaces()
    let best: string | undefined = undefined
    let ip4: boolean = false

    loop: for (const interfaceName in interfaces) {
        const interfaceInfos = interfaces[interfaceName]
        if (!interfaceInfos) continue
        for (const interfaceInfo of interfaceInfos) {
            if (interfaceInfo.internal) continue
            const address = interfaceInfo.address
            if (!best || !ip4) {
                ip4 = interfaceInfo.family == 'IPv4'
                best = `http://${ip4 ? address : `[${address}]`}`

                // Try to name the address
                let name: string | undefined
                const names = await findNamesOf(address)
                for (const dnsName of names) {
                    const dnsAddress = await findAddressOf(dnsName)
                    if (dnsAddress == address) {
                        name = dnsName
                    }
                }

                if (name) {
                    // Take the first named address
                    best = `http://${name}`
                    break loop
                }
            }
        }
    }
    return best ? new URL(best) : undefined
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