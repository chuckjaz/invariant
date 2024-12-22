import type Koa from 'koa';
import { Schema } from 'zod';
import { dataFromReadable, jsonFromData, jsonFromText } from './data';

export type Ctx = Koa.ParameterizedContext<Koa.DefaultState, Koa.DefaultContext, any>
export type Next = Koa.Next
export type ResponseFunc = (ctx: Ctx, next: Next) => Promise<void>

export function logHandler(name: string): ResponseFunc {
    let i = 0
    return async (ctx, next) => {
        const requestNumber = i++
        const startDate = new Date().toLocaleString()
        console.log(`${startDate} REQUEST(${requestNumber}:${name}): ${ctx.method} ${ctx.path}`)
        const start = Date.now()
        await next()
        const time = Date.now() - start
        const endDate = new Date().toLocaleString()
        console.log(`${endDate} RESPONSE(${requestNumber}:${name}): ${ctx.status}, time: ${time}ms`)
    }
}

export type Converter<T> = (value: string | string[] | undefined) => T | undefined

export interface QueryParameters {
    [name: string]: Converter<any>
}

export interface Headers {
    [name: string]: Converter<any>
}

export interface Handler {
    method: 'GET' | 'PUT' | 'POST' | 'HEAD'
    params?: (Schema | Converter<any>)[],
    headers?: Headers,
    query?: QueryParameters,
    body?: Schema,
    handler: (ctx: Ctx, next: Next, p1: any, p2: any, p3: any, p4: any, p5: any) => Promise<void>
}

export interface RoutePart {
    [name: string]: Route
}

export type Route = RoutePart | Route[] | Handler

function isHandler(rt: Route): rt is Handler {
    return 'handler' in rt
}

export async function route(route: Route, ctx: Ctx, next: Next): Promise<void> {
    const path = ctx.path

    async function handle(rest: string[], handler: Handler): Promise<void> {
        const params = handler.params ?? []
        if (params.length != rest.length) {
            ctx.status = 404
            return
        }
        const args: [any, any, any, any, any] = [] as any
        if (handler.query) {
            const query: { [name: string]: any } = {}
            for (const name in handler.query) {
                query[name] = handler.query[name](ctx.query[name])
            }
            args.push(query)
        }
        if (handler.headers) {
            const headers: { [name: string]: any } = {}
            for (const name in handler.headers) {
                headers[name] = ctx.headers[name]
            }
            args.push(headers)
        }
        if (params) {
            for (let i = 0; i < params.length; i++) {
                const validator = params[i]
                if (typeof validator == 'function') {
                    const arg = validator(rest[i])
                    if (arg === undefined) return
                    args.push(arg)
                } else {
                    args.push(jsonFromText(validator, rest[i]))
                }
            }
        }
        if (handler.body) {
            const body = await jsonFromData(handler.body, dataFromReadable(ctx.req))
            args.push(body)
        }
        // console.log("route handler args", args)
        await handler.handler(ctx, next, ...args)
    }

    try {
        const parts = path.split('/').slice(1)
        while (parts[parts.length - 1] === '') parts.pop()
        let i = 0;
        let current = route
        loop: while (current && i < parts.length) {
            const part = parts[i]
            if (!Array.isArray(current) && part in current) {
                current = (current as RoutePart)[part]
                i++
                if (!isHandler(current)) {
                    continue
                }
            }
            if (isHandler(current) && current.method == ctx.method) {
                await handle(parts.slice(i), current)
                return
            }
            if (Array.isArray(current)) {
                for (const item of current) {
                    if (isHandler(item)) {
                        if (item.method == ctx.method) {
                            await handle(parts.slice(i), item)
                            return
                        }
                    } else {
                        if (part in item) {
                            current = item
                            continue loop
                        }
                    }
                }
            }
            break
        }
    } catch(e: any) {
        ctx.status = e.status ?? 500
        ctx.body = e.message
    }
}

