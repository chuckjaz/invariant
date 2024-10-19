import Koa from 'koa';
import { StorageClient } from '../client';
import { dataFromReadable, jsonFromData } from '../../common/data';
import { normalizeCode } from '../../common/codes';
import { z } from 'zod'
import { idSchema } from '../../common/schema';
import { BrokerClient } from '../../broker/client';
import { dataToReadable } from '../../common/parseJson';
import { ResponseFunc } from '../../common/web';

const sha256Prefix = '/storage/sha256/'
const fetchPrefix = '/storage/fetch'

const fetchSchema = z.object({
    code: idSchema,
    container: idSchema
})

export function storageHandlers(client: StorageClient, broker?: BrokerClient): ResponseFunc {
    return async function (ctx,  next) {
        await next()
        try {
            if (ctx.path == '/id/') {
                ctx.body = await client.ping()
                ctx.status = 200
            } else if (ctx.path.startsWith(sha256Prefix)) {
                if (ctx.path == sha256Prefix && ctx.method == 'POST') {
                    console.log('post')
                    const result = await client.post(dataFromReadable(ctx.request.req))
                    if (result) {
                        ctx.status = 200
                        ctx.body = result
                    } else {
                        ctx.status = 400
                    }
                } else {
                    const hashPart = ctx.path.slice(sha256Prefix.length)
                    const hashCode = normalizeCode(hashPart)
                    if (hashCode != undefined) {
                        switch (ctx.method) {
                            case "HEAD": {
                                if (await client.has(hashCode)) {
                                    ctx.status = 200
                                    ctx.body = ''
                                }
                                break
                            }
                            case "GET": {
                                const result = await client.get(hashCode)
                                if (result) {
                                    ctx.body = dataToReadable(result)
                                    ctx.status = 200
                                }
                                break
                            }
                            case "PUT": {
                                const result = await client.put(hashCode, dataFromReadable(ctx.request.req))
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
            } else if (broker && ctx.path == fetchPrefix && ctx.method == 'PUT') {
                const result = await jsonFromData(fetchSchema, dataFromReadable(ctx.req), async request => {
                    const storage = await broker.storage(request.container)
                    if (storage) {
                        const data = await storage.get(request.code)
                        if (data) {
                            if (await client.put(request.code, data))
                                return true
                        }
                    }
                    return false
                })
                if (result) {
                    ctx.status = 200
                    ctx.body = ''

                } else {
                    ctx.status = 403
                    ctx.body = ''
                }
            }
        } catch (e) {
            console.error('Error', e)
        }
    }
}

