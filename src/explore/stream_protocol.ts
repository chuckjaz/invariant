import Koa from 'koa'
import { Channel } from "../common/channel";
import { dataToStrings, stringsToData } from "../common/data";
import { dataToReadable } from "../common/parseJson";
import { Ctx, Next } from "../common/web";
import { error } from '../common/errors';
import { delay } from '../common/delay';
import * as readline from 'node:readline/promises'

const sendChannel = new Channel<string>()
const receiveChannel = new Channel<string>()

async function startSender(): Promise<number> {
    async function handler(ctx: Ctx, next: Next) {
        if (ctx.method == 'GET') {
            const sendData = stringsToData(sendChannel.all())
            const sendReader = dataToReadable(sendData)
            ctx.body = sendReader
            ctx.status = 200
        }
    }
    const app = new Koa()
    app.use(handler)
    const httpServer = app.listen()
    const address =  httpServer.address()
    if (address == null || typeof address == 'string') error("Invalid address");
    return address.port
}

async function copyToChannel(senderPort: number) {
    const result = await fetch(`http://localhost:${senderPort}`)
    if (result.status != 200) error("Sender not listening");
    const body = result.body
    if (body == null) error("Nothing was sent");
    async function readAll(body: AsyncIterable<any>) {
        for await (const item of dataToStrings(body)) {
            receiveChannel.send(item)
        }
        console.log("Receive channel closing")
        receiveChannel.close()
    }
    readAll(body)
}

async function startReceiver() {
    for await (const item of receiveChannel.all()) {
        console.log('Received:', item)
    }
}

async function sendSomeStuff() {
    for (let i = 0; i < 10; i++) {
        sendChannel.send(`Item ${i}`)
        await delay(1000)
    }
}

async function main() {
    const port = await startSender()
    sendSomeStuff()
    await copyToChannel(port)
    startReceiver()
}

main()

async function con() {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    while (true) {
        const answer = await rl.question("> ");
        switch (answer) {
            case "quit": {
                process.exit()
                break
            }
            case "stuff": {
                sendSomeStuff()
                break
            }
            default: {
                sendChannel.send(answer)
            }
        }
    }
}

con()