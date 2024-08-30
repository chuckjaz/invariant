import { Channel } from "../../common/channel";
import { normalizeCode } from "../../common/codes";
import { PingableClient } from "../../common/pingable_client";
import { FindClient, FindResult, FindResultItem } from "../client";

const findPrefix = '/find/'
const findHasPrefix = '/find/has/'
const findNotifyPrefix = '/find/noify/'

export class Find  extends PingableClient implements FindClient {

    constructor(id: string, url: URL) {
        super(id, url)
    }

    async find(id: string): Promise<FindResult> {
        const channel = new Channel<FindResultItem>(40)
        try {
            const result = await fetch(new URL(findPrefix + id, this.url))
            if (result.status == 200) {
                // TODO: Read using streams
                const text = await result.text()
                for (const line of text.split('\n')) {
                    const [command, id] = line.split(' ')
                    const normalId = normalizeCode(id)
                    if (!normalId) {
                        console.log('Ignoring invalid find server response:', line)
                        continue
                    }
                    switch (command) {
                        case 'HAS':
                            await channel.send({ kind: 'HAS', container: normalId })
                            break
                        case 'CLOSER':
                            await channel.send({ kind: 'CLOSER', find: normalId })
                            break
                        default:
                            console.log('Ignoring invalid find server response:', line)
                            break
                    }
                }
            }
        } finally {
            channel.close()
        }
        return channel.all()
    }

    has(container: string, ids: string[]): Promise<void> {
        return this.putJson({ container, ids }, findHasPrefix)
    }

    notify(find: string): Promise<void> {
        return this.putJson({ find }, findNotifyPrefix)
    }
}
