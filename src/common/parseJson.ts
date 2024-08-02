export function safeaParseJson(text: string, reviver?: (this: any, key: string, value: any) => any): any | undefined {
    try {
        return JSON.parse(text, reviver)
    } catch {
        return undefined
    }
}