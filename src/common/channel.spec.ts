import { Channel } from "./channel"
import { delay } from "./delay"

describe('common/channel', () => {
    it('can create a channel', () => {
        const channel = new Channel<string>()
        expect(channel).toBeDefined()
    })
    it('can send a item to a channel', async () => {
        const channel = new Channel<string>()
        await channel.send('Test')
    })
    it('can and a receive a value', async () => {
        const channel = new Channel<string>()
        await channel.send('Test')
        const value = await channel.receive()
        expect(value.done).toBe(false)
        expect(value.value).toEqual('Test')
    })
    it('can send and enumerate fast the async iterator', async () => {
        const channel = new Channel<string>();
        (async function() {
            await channel.send('This')
            await channel.send('is')
            await channel.send('a')
            await channel.send('test')
            channel.close()
        })()
        const result: string[] = []
        for await (const value of channel.all()) {
            result.push(value)
        }
        expect(result).toEqual(['This', 'is', 'a', 'test'])
    })
    it('can send slow and enumerate fast the async iterator', async () => {
        const channel = new Channel<string>();
        (async function() {
            await delay(10)
            await channel.send('This')
            await delay(10)
            await channel.send('is')
            await delay(10)
            await channel.send('a')
            await delay(10)
            await channel.send('test')
            await delay(10)
            channel.close()
        })()
        const result: string[] = []
        for await (const value of channel.all()) {
            result.push(value)
        }
        expect(result).toEqual(['This', 'is', 'a', 'test'])
    })
    it('can send sporadic and enumerate fast the async iterator', async () => {
        const channel = new Channel<string>();
        (async function() {
            await delay(10)
            await channel.send('This')
            await channel.send('is')
            await delay(10)
            await channel.send('a')
            await channel.send('test')
            await delay(10)
            channel.close()
        })()
        const result: string[] = []
        for await (const value of channel.all()) {
            result.push(value)
        }
        expect(result).toEqual(['This', 'is', 'a', 'test'])
    })
    it('can stop early and closes', async () => {
        const channel = new Channel<number>()
        let exitedEarly = false;
        const background = (async function () {
            await delay(10)
            for (let i = 0; i < 1000; i++) {
                if (channel.closed) {
                    exitedEarly = true
                    break
                }
                await channel.send(i)
                await delay(10)
            }
        })()
        const result: number[] = []
        for await (const value of channel.all()) {
            result.push(value)
            if (result.length > 10) break
        }
        await background
        expect(exitedEarly).toBeTrue()
    })
    it('can limit sends', async () => {
        const channel = new Channel<number>(10)
        let maxDistance = 0
        let lastReceived = 0
        const background = (async function () {
            for (let i = 0; i < 100; i++) {
                await channel.send(i)
                maxDistance = Math.max(i - lastReceived)
            }
            channel.close()
        })();
        for await (const receive of channel.all()) {
            lastReceived = receive
            await delay(5)
        }
        await background;
        expect(maxDistance).toBeLessThan(11)
    })
})