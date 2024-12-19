import { codeConverter } from "../../common/codes";
import { ResponseFunc, route, Route } from "../../common/web";
import { ProductionClient } from "../production_client";

export function productionHandlers(server: ProductionClient): ResponseFunc {
    const routes: Route = {
        'id': {
            method: 'GET',
            handler: async function (ctx, next) {
                ctx.body = await server.ping()
                ctx.status = 200
            }
        },
        'production': [
            {
                method: 'GET',
                params: [codeConverter, codeConverter],
                handler: async function (ctx, next, task, input) {
                    ctx.body = await server.get(task, input)
                    ctx.status = 200
                }
            },
            {
                method: 'PUT',
                params: [codeConverter, codeConverter],
                query: {
                    'output': codeConverter
                },
                handler: async function (ctx, next, { output }: { output: string }, task, input) {
                    await server.put(task, input, output)
                    ctx.status = 200
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