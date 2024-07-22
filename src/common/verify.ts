import { fetchIdFrom } from "./id";

export async function verifyLive(url: string, id: string): Promise<boolean> {
    return await fetchIdFrom(url) == id 
}
