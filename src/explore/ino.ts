import fs from 'node:fs/promises'

async function main(file: string) {
    const stat = await fs.stat(file)
    console.log(stat)
}

main(process.argv[2])