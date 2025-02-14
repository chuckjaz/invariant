import { resolveTxt, resolveAny } from 'node:dns/promises'

async function main(name: string) {
    const records = await resolveTxt(name)
    console.log(records)

    const entries = await resolveAny(name)
    console.log(entries)
}

main(process.argv[2])
