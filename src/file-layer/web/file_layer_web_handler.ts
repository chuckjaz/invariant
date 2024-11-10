import z, { Schema } from "zod"
import { dataFromReadable, jsonFromData, jsonFromText } from "../../common/data"
import { invalid, InvalidRequest } from "../../common/errors"
import { contentLinkSchema } from "../../common/schema"
import { ContentLink } from "../../common/types"
import { ResponseFunc, route, Route } from "../../common/web"
import { ContentKind, EntryAttriutes, FileLayerClient, Node } from "../file_layer_client"

const nodeSchema = z.number().int().positive('Expected a node') satisfies Schema
const positiveIntSchema = z.number().int().positive('Expected a positive number') satisfies Schema
const nameSchema = z.string() satisfies Schema
const contentKindSchema = z.union([z.literal("File"), z.literal("Directory")])
const attributesSchema = z.object({
    executable: z.optional(z.boolean()),
    writable: z.optional(z.boolean()),
    modifyTime: z.optional(positiveIntSchema),
    createTime: z.optional(positiveIntSchema),
    type: z.optional(z.union([z.string(), z.null()])),
})

function offsetOrLength(value: string): number | undefined {
    const result = positiveIntSchema.safeParse(value)
    if (result.success) return result.data
    invalid(result.error.message)
}

function contentKind(value: string): ContentKind | undefined {
    if (!value || value =='') return undefined
    const result = contentKindSchema.safeParse(value)
    if (result.success) return result.data as ContentKind
}

interface OffsetLength {
    offset?: number
    length?: number
}

export function fileLayerWebHandlers(layer: FileLayerClient): ResponseFunc {
    const routes: Route = {
        'file-layer': [{
                method: 'GET',
                params: [nodeSchema],
                query: {
                    'offset': offsetOrLength,
                    'length': offsetOrLength
                },
                handler: async (ctx, next, query: OffsetLength, node: number) => {
                    ctx.body = layer.readFile(node, query.offset, query.length)
                    ctx.status = 200
                }
            },{
                method: 'POST',
                params: [nodeSchema],
                query: {
                    'offset': offsetOrLength,
                    'length': offsetOrLength
                },
                handler: async (ctx, next, query: OffsetLength, node: number) => {
                    ctx.body = await layer.writeFile(node, dataFromReadable(ctx.req), query.offset, query.length)
                    ctx.state = 200
                }
            }, {
                method: 'PUT',
                params: [nodeSchema, nameSchema],
                query: {
                    'kind': contentKind,
                },
                handler: async (ctx, next, query, parent, name) => {
                    ctx.body = await layer.createNode(parent, name, query.kind)
                    ctx.status = 200
                }
            }, {
            'mount': {
                method: 'POST',
                body: contentLinkSchema,
                handler: async (ctx, next, content: ContentLink) => {
                    ctx.body = await layer.mount(content)
                    ctx.status = 200
                }
            },
            'unmount': {
                method: 'POST',
                params: [nodeSchema],
                handler: async (ctx, next, node: Node) => {
                    ctx.body = await layer.unmount(node)
                    ctx.status = 200
                }
            },
            'info': {
                method: 'GET',
                params: [nodeSchema],
                handler: async (ctx, next, node: Node) => {
                    const result = await layer.info(node)
                    if (result) {
                        ctx.status = 200
                        ctx.body = result
                    }
                }
            },
            'lookup': {
                method: 'GET',
                params: [nodeSchema, nameSchema],
                handler: async (ctx, next, parent: number, name: string) => {
                    const result = await layer.lookup(parent, name)
                    if (result) {
                        ctx.body = result
                        ctx.status = 200
                    }
                }
            },
            'directory': {
                method: 'GET',
                params: [nodeSchema],
                query: {
                    'offset': offsetOrLength,
                    'length': offsetOrLength,
                },
                handler: async (ctx, next, query: OffsetLength, parent: Node) =>{
                    ctx.body = layer.readDirectory(parent, query.offset, query.length)
                    ctx.status = 200
                }
            },
            'remove': {
                method: 'POST',
                params: [nodeSchema, nameSchema],
                handler: async (ctx, next, parent: Node, name: string) => {
                    ctx.body = await layer.removeNode(parent, name)
                    ctx.status = 200
                }
            },
            'attributes': {
                method: 'PUT',
                params: [nodeSchema],
                body: attributesSchema,
                handler: async (ctx, next, node, attributes: EntryAttriutes) => {
                    ctx.body = await layer.setAttributes(node, attributes)
                    ctx.status = 200
                }
            },
            'size': {
                method: 'PUT',
                params: [nodeSchema, positiveIntSchema],
                handler: async (ctx, next, node, size) => {
                    await layer.setSize(node, size)
                    ctx.body = ''
                    ctx.status = 200
                }
            }
        }]
    }

    return async function (ctx, next) { await route(routes, ctx, next) }
}