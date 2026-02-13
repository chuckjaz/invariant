import { codeConverter } from "../../common/codes";
import { FindHasRequest } from "../../common/types";
import { ResponseFunc, route, Route } from "../../common/web";
import { findHasRequestSchema } from "../../find/web/find_handlers";
import { DistributeClient } from "../distribute_client";

export function distributeHandlers(client: DistributeClient): ResponseFunc {
    const routes: Route = {
        'id': {
            method: 'GET',
            handler: async function (ctx, next) {
                ctx.body = await client.ping()
                ctx.status = 200
            }
        },
        'distributor': {
            'has': {
                method: 'PUT',
                body: findHasRequestSchema,
                handler: async function (ctx, next, { container, ids }: FindHasRequest) {
                    await client.has(container, ids)
                    ctx.body = ''
                    ctx.status = 200
                }
            },
            'needed': {
                method: 'GET',
                params: [
                    codeConverter,
                    codeConverter
                ],
                handler: async function (ctx, next, server, block) {
                    const result = await client.has(server, block)
                    ctx.body = result ? 'true' : 'false'
                    ctx.status = 200
                }
            },
            'register': {
                'storage': {
                    method: 'PUT',
                    params: [codeConverter],
                    handler: async function (ctx, next, storage) {
                        await client.register(storage)
                        ctx.status = 200
                    }
                }
            },
            'unregister': {
                'storage': {
                    method: 'PUT',
                    params: [codeConverter],
                    handler: async function (ctx, next, storage) {
                        await client.unregister(storage)
                        ctx.status = 200
                    }
                }
            },
        }
    }
    return async function (ctx, next) {
        try {
            await route(routes, ctx, next)
        } catch(e) {
            console.error(e)
        }
    }
}
