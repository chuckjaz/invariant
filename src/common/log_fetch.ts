let first = 0
const enabled = (process.env['INVARIANT_LOG'] ?? '').split(',').indexOf('fetch') >= 0

export async function log_fetch(
    input: string | URL | globalThis.Request,
    init?: RequestInit,
): Promise<Response> {
    if (!enabled) return fetch(input, init)
    const start = Date.now()
    if (!first) first = start
    console.log(`fetch S ${start - first}: ${input}`)
    const response = await fetch(input, init)
    const end = Date.now()
    console.log(`fetch E ${end - first}, ${end - start}: ${input}`)
    return response
}