import type Koa from 'koa'
import { SlotsClient } from '../slot_client';
import { text } from 'co-body'
import { jsonStreamToText, safeParseJson, textToStream } from '../../common/parseJson';
import { z } from 'zod'
import { SignatureAlgorithmKind } from '../local/slots_local';

const pingPrefix = '/id/'
const slotsPrefix = '/slots/'
const slotsConfigPrefix = '/slots/config/'
const slotsHistoryPrefix = '/slots/history/'
const slotsRegister = '/slots/register'

type Ctx = Koa.ParameterizedContext<Koa.DefaultState, Koa.DefaultContext, any>
type Next = Koa.Next
type ResponseFunc = (ctx: Ctx, next: Next) => Promise<void>

const idSchema = z.string().transform((arg, ctx) => {
    try {
        return Buffer.from(arg, 'hex').toString('hex')
    } catch (e) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'id must be a hex string'
        })
        return arg
    }
})

const signatureAlgorithmNoneSchema = z.object({
    kind: z.literal(SignatureAlgorithmKind.None)
})
const signatureAlgorithmSha256RsaSchema = z.object({
    kind: z.literal(SignatureAlgorithmKind.Sha256_Rsa),
    key: z.string()
})
const signatureAlgorithmSchema = z.union([signatureAlgorithmNoneSchema, signatureAlgorithmSha256RsaSchema])
const registerSchema = z.object({
    id: idSchema,
    address: idSchema,
    signature: signatureAlgorithmSchema.optional()
})
const putSchema = z.object({
    address: idSchema,
    previous: idSchema,
    signature: z.string().optional(),
})

async function id(method: string, prefix: string, ctx: Ctx, block: (id: string) => Promise<void>): Promise<boolean> {
    if (ctx.method != method) return false
    if (!ctx.url.startsWith(prefix)) return false
    const idValidation = idSchema.safeParse(ctx.url.substring(prefix.length))
    if (!idValidation.success) {
        ctx.status = 404
        ctx.body = { reason: idValidation.error.message }
        return true
    }
    if (ctx.method == method) {
        ctx.status = 200
        try {
            await block(idValidation.data)
        } catch(e) {
            ctx.status = 404
        }
        return true
    }
    return false
}

async function json<Schema extends z.ZodType<any, any, any>, T = z.output<Schema>>(
    schema: Schema,
    ctx: Ctx,
    body: (data: T) => Promise<void>
): Promise<void>{
    const requestText = await text(ctx)
    const jsonData = safeParseJson(requestText)
    if (!jsonData) {
        ctx.status = 401
        ctx.body = { reason: 'Invalid JSON format' }
        return
    }
    const dataValidation = schema.safeParse(jsonData)
    if (!dataValidation.success) {
        ctx.status = 401
        ctx.body = { reason: dataValidation.error?.message }
        return
    }
    await body(dataValidation.data as any as T)
}

export function slotsHandler(client: SlotsClient): ResponseFunc {
    return async function (ctx, next) {
        try {
            console.log(ctx.url)
            if (await id("GET", slotsPrefix, ctx, async id => {
                ctx.body = await client.get(id)
            })) return
            if (ctx.url == slotsRegister && ctx.method == "PUT") {
                await json(registerSchema, ctx, async request => {
                    ctx.body = await client.register(request)
                })
                ctx.status = 200
                return
            }
            if (await id("PUT", slotsRegister, ctx, async id => {
                await json(putSchema, ctx, async request => {
                    ctx.body = await client.put(id, request)
                })
            })) return
            if (ctx.url == pingPrefix && ctx.method == "GET") {
                ctx.body = await client.ping()
                ctx.status = 200
                return
            }
            if (await id("GET", slotsHistoryPrefix, ctx, async id => {
                const result = await client.history(id)
                ctx.body = textToStream(jsonStreamToText(result))
            }))
            if (await id("GET", slotsConfigPrefix, ctx, async id => {
                ctx.body = await client.config(id)
            })) return
            await next()
        } catch (e) {
            ctx.status = 500
        }
    }
}

