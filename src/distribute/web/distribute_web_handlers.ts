import { BrokerClient } from "../../broker/broker_client";
import { allOfStream, dataFromReadable, dataToStrings, jsonFromData } from "../../common/data";
import { jsonStream } from "../../common/parseJson";
import { Ctx, ResponseFunc, route, Route } from "../../common/web";
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
            'pin': {
                method: 'PUT',
                handler: async function (ctx) {
                    await client.pin(ctxToStrings(ctx))
                    ctx.status = 200
                }
            },
            'unpin': {
                method: 'PUT',
                handler: async function (ctx) {
                    await client.unpin(ctxToStrings(ctx))
                    ctx.status = 200
                }
            },
            'register': {
                'storage': {
                    method: 'PUT',
                    handler: async function (ctx) {
                        await client.register(ctxToStrings(ctx))
                        ctx.status = 200
                    }
                }
            },
            'unregister': {
                'storage': {
                    method: 'PUT',
                    handler: async function (ctx) {
                        await client.unregister(ctxToStrings(ctx))
                        ctx.status = 200
                    }
                }
            },
            'blocks': {
                method: 'PUT',
                handler: async function (ctx) {
                    ctx.body = allOfStream(client.blocks(ctxToStrings(ctx)))
                    ctx.status = 200
                }
            }
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

function ctxToStrings(ctx: Ctx): AsyncIterable<string> {
    return jsonStream<string>(dataToStrings(dataFromReadable(ctx.req)))
}