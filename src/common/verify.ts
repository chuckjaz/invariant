import { fetchIdFrom } from "./id";

export async function verifyLive(url: string, id: string): Promise<boolean> {
    const received = await fetchIdFrom(url)
    if (id != received) {
        console.log(`Expected: '${id}', received: '${received}'`)
    }
    return received == id
}
