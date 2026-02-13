import { ManagedStorageClient, StorageClient } from '../storage_client';
import { allOfStream, dataFromReadable, jsonFromData } from '../../common/data';
import { z } from 'zod'
import { idSchema } from '../../common/schema';
import { BrokerClient } from '../../broker/broker_client';
import { dataToReadable, jsonStreamToText, textToReadable } from '../../common/parseJson';
import { ResponseFunc, route, Route } from '../../common/web';
    import { codeConverter } from '../../common/codes';
import add from '../../cli/add';

const fetchSchema = z.object({
    address: idSchema,
    container: idSchema
})

function countConverter(value: string | string[] | undefined): number | undefined {
    if (typeof value == 'string') {
        const result = parseInt(value)
        if (Number.isNaN(result)) return undefined
        return result
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
                ],
                'forget': [
                    {
                        method: 'HEAD',
                        handler: async function(ctx, next) {
                            if ((client as any).forget) {
                                ctx.status = 200
                                ctx.body = ''
                            }
                        }
                    },
                    {
                        method: 'PUT',
                        params: [codeConverter],
                        handler: async function (ctx, next, address) {
                            if (await (client as ManagedStorageClient).forget(address)) {
                                ctx.status = 200
                                ctx.body = ''
                            }
                        }
                    }
                ],
                'blocks': [
                    {
                        method: 'HEAD',
                        handler: async function (ctx, next) {
                            if ((client as any).blocks) {
                                ctx.status = 200
                                ctx.body = ''
                            }
                        }
                    },
                    {
                        method: 'GET',
                        query: {
                            'after': codeConverter,
                            'count': countConverter
                        },
                        handler: async function (ctx, next, query: { after?: string, count?: number}) {
                            const result = (client as ManagedStorageClient).blocks(query.count, query.after)
                            ctx.status = 200
                            ctx.body = textToReadable(jsonStreamToText(result))
                        }
                    }
                ]
            },
            {
                method: 'HEAD',
                params: [codeConverter],
                handler: async function (ctx, next, address) {
                    if (await client.has(address)) {
                        ctx.body = ''
                        ctx.status = 200
                    }
                }
            },
            {
                method: 'GET',
                params: [codeConverter],
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
                params: [codeConverter],
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

