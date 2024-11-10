import type Koa from 'koa';
import { Schema } from 'zod';
import { InvalidRequest } from './errors';
import { dataFromReadable, jsonFromData, jsonFromText } from './data';

export type Ctx = Koa.ParameterizedContext<Koa.DefaultState, Koa.DefaultContext, any>
export type Next = Koa.Next
export type ResponseFunc = (ctx: Ctx, next: Next) => Promise<void>

export function logHandler(name: string): ResponseFunc {
    let i = 0
    return async (ctx, next) => {
        const requestNumber = i++
        console.log(`REQUEST(${name}:${requestNumber}): ${ctx.method} ${ctx.path}`)
        const start = Date.now()
        await next()
        const time = Date.now() - start
        console.log(`RESPONSE(${name}:${requestNumber}): ${ctx.status}, time: ${time}ms`)
    }
}

export type Converter<T> = (value: string) => T | undefined

export interface QueryParameters {
    [name: string]: Converter<any>
}

export interface Headers {
    [name: string]: Converter<any>
}

export interface Handler {
    method: 'GET' | 'PUT' | 'POST' | 'HEAD'
    params?: Schema[],
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
                query[name] = handler.query[name](ctx.get(name))
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
                args.push(jsonFromText(params[i], rest[i]))
            }
        }
        if (handler.body) {
            const body = await jsonFromData(handler.body, dataFromReadable(ctx.req))
            args.push(body)
        }
        await handler.handler(ctx, next, ...args)
    }

    try {
        const parts = ctx.url.split('/')
        let i = 0;
        let current = route
        loop: while (current && i < parts.length) {
            const part = parts[i]
            if (part in current) {
                current = (current as RoutePart)[part]
                i++
                continue
            }
            if (isHandler(current) && current.method == ctx.method) {
                await handle(parts.slice(i), current)
                return
            }
            if (Array.isArray(current)) {
                for (const item of current) {
                    if (isHandler(item)) {
                        if (item.method == ctx.method) {
                            await handle(parts.slice(1), item)
                            return
                        }
                    } else {
                        current = item
                        continue loop
                    }

                }
            }
            break
        }
    } catch(e) {
        if (e instanceof InvalidRequest) {
            ctx.status = 403
            ctx.body = e.message
        } else {
            ctx.status = 500
            ctx.body = (e as Error).message
        }
    }
}

