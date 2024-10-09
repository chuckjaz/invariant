import { generateKeyPair as gkp } from 'node:crypto'
import { promisify } from 'node:util'

const generateKeyPair = promisify(gkp)

async function generate() {
    const keyPair = await generateKeyPair("rsa", { modulusLength: 2048 })
    const publicText = keyPair.publicKey.export({ type: 'pkcs1', format: 'pem' })
    console.log('public', publicText)
    const privateText = keyPair.privateKey.export({ type: 'pkcs1', format: 'pem' })
    console.log('private', privateText)
}

generate().catch(e => console.log(e))
