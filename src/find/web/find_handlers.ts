import z from "zod";
import { BrokerClient } from "../../broker/broker_client";
import { ResponseFunc, route, Route } from "../../common/web";
import { FindClient } from "../client";
import { idSchema } from "../../common/schema";
import { FindHasRequest, FindNotifyRequest } from "../../common/types";
import { codeConverter } from "../../common/codes";

const findHasRequestSchema = z.object({
    container: idSchema,
    ids: z.array(idSchema)
})

const findNotifyRequestSchema = z.object({
    find: idSchema
})

export function findHandlers(client: FindClient, broker?: BrokerClient): ResponseFunc {
    const routes: Route = {
        'id': {
            method: 'GET',
            handler: async function (ctx, next) {
                ctx.body = await client.ping()
                ctx.status = 200
            }
        },
        'find': [
            {
                'has': {
                    method: 'PUT',
                    body: findHasRequestSchema,
                    handler: async function (ctx, next, { container, ids }: FindHasRequest) {
                        await client.has(container, ids)
                        ctx.body = ''
                        ctx.status = 200
                    }
                },
                'notify': {
                    method: 'PUT',
                    body: findNotifyRequestSchema,
                    handler: async function (ctx, next, { find }: FindNotifyRequest) {
                        await client.notify(find)
                        ctx.body = ''
                        ctx.status = 200
                    }
                }
            },
            {
                method: 'GET',
                params: [codeConverter],
                handler: async function (ctx, next, id) {
                    let result =  ''
                    const results = await client.find(id)
                    for await (const item of results) {
                        switch (item.kind) {
                            case 'HAS':
                                result += `HAS ${item.container}\n`
                                break
                            case 'CLOSER':
                                result += `CLOSER ${item.find}\n`
                                break
                        }
                    }
                    ctx.status = 200
                    ctx.body = result
                }
            }
        ]
    }
    return async function (ctx, next) {
        try {
            await route(routes, ctx, next)
        } catch(e) {
            console.error(e)
        }
    }
}