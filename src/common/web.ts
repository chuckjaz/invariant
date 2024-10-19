import type Koa from 'koa';

export type Ctx = Koa.ParameterizedContext<Koa.DefaultState, Koa.DefaultContext, any>
export type Next = Koa.Next
export type ResponseFunc = (ctx: Ctx, next: Next) => Promise<void>

let i = 0

export function logHandler(): ResponseFunc {
    return async (ctx, next) => {
        const requestNumber = i++
        console.log(`REQUEST(${requestNumber}): ${ctx.method} ${ctx.path}`)
        const start = Date.now()
        await next()
        const time = Date.now() - start
        console.log(`RESPONSE(${requestNumber}): ${ctx.status}, time: ${time}ms`)
    }
}