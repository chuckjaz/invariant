import z, { Schema } from "zod"
import { allOfStream, dataFromReadable } from "../../common/data"
import { invalid } from "../../common/errors"
import { contentLinkSchema } from "../../common/schema"
import { ContentLink } from "../../common/types"
import { ResponseFunc, route, Route } from "../../common/web"
import { ContentKind, EntryAttributes, FilesClient, Node } from "../files_client"
import { dataToReadable } from "../../common/parseJson"

const nodeSchema = z.number().int().nonnegative('Expected a node') satisfies Schema
const nonNegativeIntSchema = z.number().int().nonnegative('Expected a positive number') satisfies Schema
const contentKindSchema = z.union([z.literal("File"), z.literal("Directory")])
const attributesSchema = z.object({
    executable: z.optional(z.boolean()),
    writable: z.optional(z.boolean()),
    modifyTime: z.optional(nonNegativeIntSchema),
    createTime: z.optional(nonNegativeIntSchema),
    type: z.optional(z.union([z.string(), z.null()])),
})

function offsetOrLength(value: string | string[] | undefined): number | undefined {
    if (!value || value == '' || Array.isArray(value)) return undefined
    const result = parseInt(value)
    if (Number.isNaN(result) || result < 0) invalid("Expected a non-negative number")
    return result
}

function contentKind(value: string | string[] | undefined): ContentKind | undefined {
    if (!value || value == '' || Array.isArray(value)) return undefined
    const result = contentKindSchema.safeParse(value)
    if (result.success) return result.data as ContentKind
}

function convertString(value: string | string[] | undefined): string | undefined {
    if (!value || value == '' || Array.isArray(value)) return undefined
    return value
}

interface OffsetLength {
    offset?: number
    length?: number
}

export function filesWebHandlers(client: FilesClient): ResponseFunc {
    const routes: Route = {
        'files': [{
            'mount': {
                method: 'POST',
                body: contentLinkSchema,
                handler: async (ctx, next, content: ContentLink) => {
                    ctx.body = await client.mount(content)
                    ctx.status = 200
                }
            },
            'unmount': {
                method: 'POST',
                params: [nodeSchema],
                handler: async (ctx, next, node: Node) => {
                    ctx.body = await client.unmount(node)
                    ctx.status = 200
                }
            },
            'info': {
                method: 'GET',
                params: [nodeSchema],
                handler: async (ctx, next, node: Node) => {
                    console.log("info:", node)
                    const result = await client.info(node)
                    if (result) {
                        console.log("info: result:", result)
                        ctx.status = 200
                        ctx.body = result
                    } else {
                        console.log("info: Not Found")
                    }
                }
            },
            'lookup': {
                method: 'GET',
                params: [nodeSchema, convertString],
                handler: async (ctx, next, parent: number, name: string) => {
                    console.log("lookup:", parent, name)
                    const result = await client.lookup(parent, name)
                    if (result) {
                        console.log("lookup: result:", result)
                        ctx.body = result
                        ctx.status = 200
                    } else {
                        console.log("lookup: Not Found")
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
                    console.log('directory', query, parent)
                    ctx.body = await allOfStream(client.readDirectory(parent, query.offset, query.length))
                    ctx.status = 200
                }
            },
            'remove': {
                method: 'POST',
                params: [nodeSchema, convertString],
                handler: async (ctx, next, parent: Node, name: string) => {
                    ctx.body = await client.removeNode(parent, name)
                    ctx.status = 200
                }
            },
            'attributes': {
                method: 'PUT',
                params: [nodeSchema],
                body: attributesSchema,
                handler: async (ctx, next, node, attributes: EntryAttributes) => {
                    await client.setAttributes(node, attributes)
                    ctx.body = ''
                    ctx.status = 200
                }
            },
            'size': {
                method: 'PUT',
                params: [nodeSchema, nonNegativeIntSchema],
                handler: async (ctx, next, node, size) => {
                    await client.setSize(node, size)
                    ctx.body = ''
                    ctx.status = 200
                }
            },
            'rename': {
                method: 'PUT',
                params: [nodeSchema, convertString],
                query: {
                    'newParent': offsetOrLength,
                    'newName': convertString
                },
                handler: async (ctx, next, query: { newParent?: Node, newName?: string }, parent, name: string) => {
                    const newParent = query.newParent
                    const newName = query.newName
                    ctx.body = ''
                    if (newName === undefined || newParent === undefined || await client.rename(parent, name, newParent, newName)) {
                        ctx.status = 404
                    } else {
                        ctx.status = 200
                    }
                }
            },
            'link': {
                method: 'PUT',
                params: [nodeSchema, convertString],
                query: { 'node': offsetOrLength },
                handler: async (ctx, next, query: { node?: Node }, parent, name: string) => {
                    const node = query.node
                    ctx.body = ''
                    if (node === undefined || await client.link(parent, node, name)) {
                        ctx.status = 404
                    } else {
                        ctx.status = 200
                    }
                }
            },
            'sync': {
                method: 'PUT',
                handler: async (ctx, next) => {
                    await client.sync()
                    ctx.body = ''
                    ctx.status = 200
                }
            }
        },{
            method: 'GET',
            params: [nodeSchema],
            query: {
                'offset': offsetOrLength,
                'length': offsetOrLength
            },
            handler: async (ctx, next, query: OffsetLength, node: number) => {
                ctx.body = dataToReadable(client.readFile(node, query.offset, query.length))
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
                ctx.body = await client.writeFile(node, dataFromReadable(ctx.req), query.offset, query.length)
                ctx.state = 200
            }
        }, {
            method: 'PUT',
            params: [nodeSchema, convertString],
            query: {
                'kind': contentKind,
            },
            handler: async (ctx, next, query, parent, name) => {
                ctx.body = await client.createNode(parent, name, query.kind)
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
