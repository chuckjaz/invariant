import { dirname } from 'node:path'
import { mkdir, stat, rename } from 'node:fs/promises'

export async function moveFile(source: string, dest: string) {
    const dir = dirname(dest)
    await mkdir(dir, { recursive: true})
    await rename(source, dest)
}

export async function fileExists(file: string): Promise<boolean> {
    try {
        const fstat = await stat(file)
        if (fstat.isFile()) return true
    } catch (e) {

    }
    return false
}

export async function directoryExists(path: string): Promise<boolean> {
    try {
        const fstat = await stat(path)
        if (fstat.isDirectory()) return true
    } catch (e) {

    }
    return false
}

export async function fileSize(file: string): Promise<number | undefined> {
    try {
        const fstat = await stat(file);
        return fstat.size
    } catch {
        return undefined
    }
}
