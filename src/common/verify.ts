import { fetchIdFrom } from "./id";

export async function verifyLive(url: string, id: string): Promise<boolean> {
    const received = await fetchIdFrom(url)
    if (id != received) {
        console.log(`Expected: '${id}', received: '${received}'`)
    }
    return received == id
}

export async function firstLive(urls: string[], id: string): Promise<string | undefined> {
    for (const url of urls) {
        if (await verifyLive(url, id)) return url
    }
}