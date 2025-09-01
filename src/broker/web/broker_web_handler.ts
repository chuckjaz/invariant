import { codeConverter } from "../../common/codes";
import { allOfStream } from "../../common/data";
import { idSchema } from "../../common/schema";
import { BrokerRegisterRequest } from "../../common/types";
import { ResponseFunc, route, Route } from "../../common/web";
import { BrokerServer } from '../broker_server';
import { z } from 'zod'

function kindConverter(value: string | string[] | undefined): string | undefined {
    switch (value) {
        case "broker":
        case "distribute":
        case "files":
        case "find":
        case "names":
        case "productions":
        case "slots":
        case "storage":
            return value
    }
    return undefined
}

const brokerRegisterRequestSchema = z.object({
    id: idSchema,
    urls: z.string().url().array(),
    kind: z.enum(["broker", "distribute", "files", "find", "names", "productions", "slots", "storage"])
})

export function brokerHandlers(server: BrokerServer): ResponseFunc {
    const routes: Route = {
        'id': {
            method: 'GET',
            handler: async function (ctx, next) {
                ctx.body = await server.ping()
                ctx.status = 200
            }
        },
        'broker': {
            'location': {
                method: 'GET',
                params: [codeConverter],
                handler: async function (ctx, next, id) {
                    ctx.body = await server.location(id)
                    ctx.status = 200
                }

            },
            'register': {
                method: 'POST',
                body: brokerRegisterRequestSchema,
                handler: async function (ctx, next, request: BrokerRegisterRequest) {
                    const urls = request.urls.map(u => new URL(u))
                    const response = await server.register(request.id, urls, request.kind)
                    if (response) {
                        ctx.body = response
                        ctx.status = 200
                    }
                }
            },
            'registered': {
                method: 'GET',
                params: [kindConverter],
                handler: async function (ctx, next, kind) {
                    const items = await allOfStream(await server.registered(kind))
                    ctx.body = items
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