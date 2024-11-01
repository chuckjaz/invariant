import Koa from 'koa';
import { StorageClient } from '../client';
import { dataFromReadable, jsonFromData } from '../../common/data';
import { normalizeCode } from '../../common/codes';
import { z } from 'zod'
import { idSchema } from '../../common/schema';
import { BrokerClient } from '../../broker/client';
import { dataToReadable } from '../../common/parseJson';
import { ResponseFunc } from '../../common/web';

const idPrefix = '/id/'
const storagePrefix = '/storage/'
const fetchPrefix = `${storagePrefix}fetch`

const fetchSchema = z.object({
    address: idSchema,
    container: idSchema
})

export function storageHandlers(client: StorageClient, broker?: BrokerClient): ResponseFunc {
    return async function (ctx,  next) {
        await next()
        try {
            if (ctx.path == idPrefix) {
                ctx.body = await client.ping()
                ctx.status = 200
            } else if (ctx.path.startsWith(storagePrefix)) {
                if (ctx.path == storagePrefix && ctx.method == 'POST') {
                    console.log('post')
                    const result = await client.post(dataFromReadable(ctx.request.req))
                    if (result) {
                        ctx.status = 200
                        ctx.body = result
                    } else {
                        ctx.status = 400
                    }
                } else {
                    const addressPart = ctx.path.slice(storagePrefix.length)
                    const address = normalizeCode(addressPart)
                    if (address != undefined) {
                        switch (ctx.method) {
                            case "HEAD": {
                                if (await client.has(address)) {
                                    ctx.status = 200
                                    ctx.body = ''
                                }
                                break
                            }
                            case "GET": {
                                const result = await client.get(address)
                                if (result) {
                                    ctx.body = dataToReadable(result)
                                    ctx.status = 200
                                }
                                break
                            }
                            case "PUT": {
                                const result = await client.put(address, dataFromReadable(ctx.request.req))
                                if (result) {
                                    ctx.body = ''
                                    ctx.status = 200
                                } else {
                                    ctx.body = ''
                                    ctx.status = 400
                                }
                            }
                        }
                    }
                }
            } else if (broker && ctx.path == fetchPrefix) {
                switch (ctx.method) {
                    case 'PUT': {
                        const request = await jsonFromData(fetchSchema, dataFromReadable(ctx.req))
                        if (request) {
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
                        ctx.status = 403
                        ctx.body = ''
                        break
                    }
                    case 'HEAD': {
                        ctx.status = 200
                        ctx.body = ''
                        break
                    }

                }
            }
        } catch (e) {
            console.error('Error', e)
        }
    }
}

