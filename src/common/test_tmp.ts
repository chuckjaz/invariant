import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'

export async function withTmpDir<R>(block: (tmpDir: string) => Promise<R>): Promise<R> {
    const osTmpDir = os.tmpdir()
    const tmpDir = await fs.mkdtemp(path.join(osTmpDir, 'invariant-test'))
    try {
        return await block(tmpDir)
    } finally {
        await fs.rm(tmpDir, { force: true, recursive: true })
    }
}

export function withTempFile<R>(content: string, block: (tmpFileName: string) => Promise<R>): Promise<R> {
    return withTmpDir(async tmpDir => {
        const tmpFileName = path.join(tmpDir, 'test.dat')
        await fs.writeFile(tmpFileName, content, 'utf-8')
        return await block(tmpFileName)
    })
}
