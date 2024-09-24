import type Koa from 'koa'
import { SlotsClient } from '../slot_client';
import { normalizeCode } from '../../common/codes';
import { text } from 'co-body'
import { SlotsPutRequest, SlotsRegisterRequest } from '../../common/types';
import { jsonStreamToText, safeParseJson, textToStream } from '../../common/parseJson';

const pingPrefix = '/id/'
const slotsPrefix = '/slots/'
const slotsConfigPrefix = '/slots/config/'
const slotsHistoryPrefix = '/slots/history/'
const slotsRegister = '/slots/register'

type ResponseFunc = (
    ctx: Koa.ParameterizedContext<Koa.DefaultState, Koa.DefaultContext, any>,
    next: Koa.Next
) => Promise<void>;

export function slotsServer(client: SlotsClient): ResponseFunc {
    return async function (ctx, next) {
        try {
            await next()
            if (ctx.url.startsWith(slotsPrefix)) {
                const idText = ctx.url.substring(slotsPrefix.length)
                const id = normalizeCode(idText)
                if (!id) {
                    ctx.status = 404
                    return
                }
                if (ctx.method == "GET") {
                    const result = await client.get(id)
                    ctx.status = 200
                    ctx.body = result
                    return
                }
                if (ctx.method == "PUT") {
                    const requestText = await text(ctx)
                    const request: SlotsPutRequest = safeParseJson(requestText)
                    const result = await client.put(id, request)
                    if (result) {
                        ctx.status = 200
                    } else {
                        ctx.status = 400
                    }
                    return
                }
            }
            if (ctx.url == pingPrefix && ctx.method == "GET") {
                ctx.body = await client.ping()
                ctx.status = 200
                return
            }
            if (ctx.url.startsWith(slotsHistoryPrefix) && ctx.method == "GET") {
                const idText = ctx.url.substring(slotsPrefix.length)
                const id = normalizeCode(idText)
                if (!id) {
                    ctx.status = 404
                    return
                }
                try {
                    const result = await client.history(id)
                    ctx.status = 200
                    ctx.body = textToStream(jsonStreamToText(result))
                } catch (e) {
                    ctx.status = 404
                }
                return
            }
            if (ctx.url.startsWith(slotsConfigPrefix) && ctx.method == "GET") {
                const idText = ctx.url.substring(slotsPrefix.length)
                const id = normalizeCode(idText)
                if (!id) {
                    ctx.status = 404
                    return
                }
                try {
                    ctx.body = await client.config(id)
                    ctx.status = 200
                    return
                } catch (e) {
                    ctx.status = 404
                    return
                }
            }
            if (ctx.url == slotsRegister && ctx.message == "PUT") {
                const requestText = await text(ctx)
                const request: SlotsRegisterRequest = safeParseJson(requestText)
                const result = await client.register(request)
                if (result) {
                    ctx.status = 200
                } else {
                    ctx.status = 400
                }
                return
            }
        } catch (e) {
            ctx.status = 500
        }
    }
}

