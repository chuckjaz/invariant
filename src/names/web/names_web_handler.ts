import z from "zod";
import { Converter, ResponseFunc, route, Route } from "../../common/web";
import { NamesClient } from "../names_client";
import { idSchema } from "../../common/schema";

const nameReg = /^(\w|\d)+(\.(\w|\d)+)*$/

const nameConverter: Converter<string> = (value: string | string[] | undefined) => {
    if (typeof value === 'string' && value.match(nameReg)) {
        return value
    }
}

const registerSchema = z.object({
    name: z.string().regex(nameReg),
    address: idSchema,
    ttl: z.number().int().positive().optional()
})

const updateSchema = z.object({
    name: z.string().regex(nameReg),
    previous: idSchema,
    address: idSchema,
    ttl: z.number().int().positive().optional()
})

export function namesHandler(client: NamesClient): ResponseFunc {
    const routes: Route = {
        'id': {
            method: 'GET',
            handler: async function (ctx, next) {
                ctx.body = await client.ping()
                ctx.status = 200
            }
        },
        'names': {
            'lookup': {
                method: 'GET',
                params: [nameConverter],
                handler: async function (ctx, next, name) {
                    ctx.body = await client.lookup(name)
                    ctx.status = 200
                }
            },
            'register': {
                method: 'PUT',
                body: registerSchema,
                handler: async function (ctx, next, register: z.TypeOf<typeof registerSchema>) {
                    await client.register(register.name, register.address, register.ttl)
                    ctx.body = ''
                    ctx.status = 200
                }
            },
            'update': {
                method: 'POST',
                body: updateSchema,
                handler: async function (ctx, next, update: z.TypeOf<typeof updateSchema>) {
                    ctx.body = client.update(update.name, update.previous, update.address, update.ttl)
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
