import Koa from 'koa';
import { StorageClient } from '../client';
import { dataFromReadable, jsonFromData } from '../../common/data';
import { z } from 'zod'
import { idSchema } from '../../common/schema';
import { BrokerClient } from '../../broker/client';
import { dataToReadable } from '../../common/parseJson';
import { Converter, ResponseFunc, route, Route } from '../../common/web';
import { normalizeCode } from '../../common/codes';

const fetchSchema = z.object({
    address: idSchema,
    container: idSchema
})

const addressConverter: Converter<string> = (value: string | string[] | undefined) => {
    if (typeof value === 'string') {
        return normalizeCode(value)
    }
}

export function storageHandlers(client: StorageClient, broker?: BrokerClient): ResponseFunc {
    const routes: Route = {
        'id': {
            method: 'GET',
            handler: async function (ctx, next) {
                ctx.body = await client.ping()
                ctx.status = 200
            }
        },
        'storage': [
            {
                'fetch': [
                    {
                        method: 'HEAD',
                        handler: async function (ctx, next) {
                            if (broker) {
                                ctx.status = 200
                                ctx.body = ''
                            }
                        }
                    },
                    {
                        method: 'PUT',
                        body: fetchSchema,
                        handler: async function (ctx, next, request: { address: string, container: string}) {
                            if (broker) {
                                const storage = await broker.storage(request.container)
                                if (storage) {
                                    const data = await storage.get(request.address)
                                    if (data) {
                                        if (await client.put(request.address, data)) {
                                            ctx.status = 200
                                            ctx.body = ''
                                            return
                                        }
                                    }
                                }
                            }
                        }
                    }
                ]
            },
            {
                method: 'HEAD',
                params: [addressConverter],
                handler: async function (ctx, next, address) {
                    if (await client.has(address)) {
                        ctx.body = ''
                        ctx.status = 200
                    }
                }
            },
            {
                method: 'GET',
                params: [addressConverter],
                handler: async function (ctx, next, address) {
                    const result = await client.get(address)
                    if (result) {
                        ctx.body = dataToReadable(result)
                        ctx.status = 200
                    }
                }
            },
            {
                method: 'PUT',
                params: [addressConverter],
                handler: async function (ctx, next, address) {
                    const result = await client.put(address, dataFromReadable(ctx.request.req))
                    if (result) {
                        ctx.body = ''
                        ctx.status = 200
                    } else {
                        ctx.body = ''
                        ctx.status = 400
                    }
                }
            },
            {
                method: 'POST',
                handler: async function (ctx, next) {
                    const result = await client.post(dataFromReadable(ctx.request.req))
                    if (result) {
                        ctx.status = 200
                        ctx.body = result
                    } else {
                        ctx.status = 400
                    }
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

