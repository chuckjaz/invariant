import { generateKeyPair as gkp, randomBytes, sign as sgn, verify as vfy, createPublicKey } from 'node:crypto'
import { promisify } from 'node:util'
import * as fs from 'node:fs/promises'

/* */
const generateKeyPair = promisify(gkp)
const sign = promisify(sgn)
const verify = promisify(vfy)
async function gen() {
    const result = await generateKeyPair("rsa", { modulusLength: 2048 })

    const exportedKey = result.publicKey.export({ type: 'pkcs1', format: 'pem' })
    const jwt = result.publicKey.export({ format: 'jwk' })
    console.log('jwt', jwt)
    console.log('exported', exportedKey.length, exportedKey)

    // generate some signed bytes
    const data = randomBytes(32)
    console.log('data', data)

    const signature = await sign("sha256", data, result.privateKey)
    console.log(signature)

    const verfied = await verify("sha256", data, result.publicKey, signature)
    console.log('verified', verfied)

    const importedKey = createPublicKey(exportedKey)
    console.log(importedKey)
    const verifiedImport = await verify("sha256", data, importedKey, signature)
    console.log('verifiedImport', verifiedImport)
}

gen()
/*/

async function tryConflict() {
    const filename = '/tmp/test.dat'

    let f1: fs.FileHandle | undefined
    let f2: fs.FileHandle | undefined
    try { f1 = await fs.open(filename, 'wx') } catch(e) { console.error('error', e) }
    try { f2 = await fs.open(filename, "wx") } catch(e) { console.error('error', e) }
    console.log('f1', f1, 'f2', f2)
    if (f1) await f1.close();
    if (f2) await f2.close();
    console.log("Files close")
    await fs.rm(filename)
}

tryConflict().catch(e => console.error(e))
/* */
