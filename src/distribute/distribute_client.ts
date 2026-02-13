import { HasListener } from "../find/client";

export interface DistributeClient extends HasListener {
    ping(): Promise<string | undefined>
    needed(storage: string, id: string): Promise<boolean>
    register(server: string): Promise<void>
    unregister(server: string): Promise<void>
}
