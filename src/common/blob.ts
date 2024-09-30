import { Blob } from 'node:buffer'
import { Channel } from './channel'

export async function streamBlob(blob: Blob): Promise<AsyncIterable<Buffer>> {
    const channel = new Channel<Buffer>()
    async function readAll() {
        try {
            const stream = blob.stream()
            const reader = stream.getReader()
            let done = false
            while (!channel.closed && !done) {
                const result = await reader.read()
                if (result.done) {
                    done = true
                } else {
                    channel.send(result.value)
                }
            }
            channel.close()
        } catch(e: any) {
            channel.fail(e)
        }
    }
    readAll()
    return channel.all()
}
