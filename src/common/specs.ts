export type Spec = (name: string) => string | undefined

const replaceReg = /\$(\d+)/g

export function textToSpec(specString: string): Spec {
    const [from, to] = specString.split(',')
    const fromReg = new RegExp(`^${from}$`)
    return (name: string) => {
        const match = name.match(fromReg)
        if (!match) return undefined
        return to.replace(replaceReg, (substring: string, ...args: string[]) => {
            const index = parseInt(substring.slice(1))
            return match[index]
        })
    }
}