import { SlotsClient } from '../slot_client';
import { jsonStreamToText, textToReadable } from '../../common/parseJson';
import { z } from 'zod'
import { SignatureAlgorithmKind } from '../local/slots_local';
import { idSchema } from '../../common/schema';
import { ResponseFunc, route, Route } from '../../common/web';
import { SlotsPutRequest, SlotsRegisterRequest } from '../../common/types';
import { codeConverter } from '../../common/codes';
import { invalid } from '../../common/errors';

const signatureAlgorithmNoneSchema = z.object({
    kind: z.literal(SignatureAlgorithmKind.None)
})
const signatureAlgorithmSha256RsaSchema = z.object({
    kind: z.literal(SignatureAlgorithmKind.Sha256_Rsa),
    key: z.string()
})
const signatureAlgorithmSchema = z.union([signatureAlgorithmNoneSchema, signatureAlgorithmSha256RsaSchema])
const registerSchema = z.object({
    id: idSchema,
    address: idSchema,
    signature: signatureAlgorithmSchema.optional()
})

const putSchema = z.object({
    address: idSchema,
    previous: idSchema,
    signature: z.optional(z.string()),
    proof: z.optional(z.string()),
})

export function slotsHandler(client: SlotsClient): ResponseFunc {
    const routes: Route = {
        'id': {
            method: 'GET',
            handler: async function (ctx, next) {
                ctx.body = await client.ping()
                ctx.status = 200
            }
        },
        'slots': [{
            'register': {
                method: 'PUT',
                body: registerSchema,
                handler: async function (ctx, next, request: SlotsRegisterRequest) {
                    ctx.body = await client.register(request)
                    ctx.status = 200
                }
            },
            'config': {
                method: 'GET',
                params: [codeConverter],
                handler: async function (ctx, next, id) {
                    ctx.body = await client.config(id)
                    ctx.status = 200
                }
            },
            'history': {
                method: 'GET',
                params: [codeConverter],
                handler: async function (ctx, next, id) {
                    const result = client.history(id)
                    ctx.body = textToReadable(jsonStreamToText(result))
                    ctx.status = 200
                }
            },
            'watch': {
                method: 'GET',
                params: [codeConverter],
                handler: async function (ctx, next, id: string) {
                    const result = client.watch(id)
                    ctx.body = textToReadable(jsonStreamToText(result))
                    ctx.status = 200
                }
            }
        }, {
            method: 'GET',
            params: [codeConverter],
            handler: async function (ctx, next, id) {
                ctx.body = await client.get(id)
                ctx.status = 200
            }
        }, {
            method: 'PUT',
            params: [codeConverter],
            body: putSchema,
            handler: async function (ctx, next, id, request: SlotsPutRequest) {
                const result = await client.put(id, request)
                if (!result) invalid('Invalid slot request');
                ctx.body = ''
                ctx.status = 200
            }
        }]
    }

    return async function (ctx, next) {
        try {
            await route(routes, ctx, next)
        } catch(e) {
            console.error(e)
        }
    }
}
