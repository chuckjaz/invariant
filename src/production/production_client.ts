export interface ProductionsClient {
    ping(): Promise<string | undefined>
    get(task: string, input: string): Promise<string | undefined>
    put(task: string, input: string, output: string): Promise<void>
}

