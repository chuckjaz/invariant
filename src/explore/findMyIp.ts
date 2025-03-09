import dns from 'node:dns/promises'
import os from 'node:os'

async function main() {
    const interfaces = os.networkInterfaces()
    for (const interfaceName in interfaces) {
        const interfaceInfos = interfaces[interfaceName]
        if (!interfaceInfos) continue
        for (const interfaceInfo of interfaceInfos) {
            if (!interfaceInfo.internal) {
                console.log("Useful address:", interfaceInfo.address, 'scope', interfaceInfo.scopeid)
                try {
                    const reversed = await dns.reverse(interfaceInfo.address)
                    console.log('names:', reversed)
                } catch(e) {
                }
            }
        }
    }
}

var f = main()