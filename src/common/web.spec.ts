import z, { Schema } from "zod";
import { contentLinkSchema, idSchema } from "./schema";
import { Ctx, Next, route, Route } from "./web";
import { codeConverter } from "./codes";
import { randomId } from "./id";
import { dataFromString, dataToReadable } from "./parseJson";
import { Data } from "../storage/storage_client";
import { BrokerRegisterRequest, ContentLink, FindHasRequest, FindNotifyRequest, SlotsPutRequest, SlotsRegisterRequest } from "./types";
import { ContentKind, EntryAttributes, Node } from "../files/files_client";
import { invalid } from "./errors";
import { SignatureAlgorithmKind } from "../slots/local/slots_local";

// From storage
const fetchSchema = z.object({
    address: idSchema,
    container: idSchema
})

// From files
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
function convertString(value: string | string[] | undefined): string | undefined {
    if (!value || value == '' || Array.isArray(value)) return undefined
    return value
}
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
interface OffsetLength {
    offset?: number
    length?: number
}

// From find
const findHasRequestSchema = z.object({
    container: idSchema,
    ids: z.array(idSchema)
})
const findNotifyRequestSchema = z.object({
    find: idSchema
})

// From slots
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

// From broker
function kindConverter(value: string | string[] | undefined): string | undefined {
    switch (value) {
        case "broker":
        case "distribute":
        case "files":
        case "find":
        case "productions":
        case "slots":
        case "storage":
            return value
    }
    return undefined
}

const brokerRegisterRequestSchema = z.object({
    id: idSchema,
    url: z.string().url(),
    kind: z.enum(["broker", "distribute", "files", "find", "productions", "slots", "storage"])
})


describe("common/web", () => {
    it('can route a root get', async () => {
        await get('/a/b', {
            method: 'GET',
            params: [anyParam, anyParam ],
            handler: async function (ctx: Ctx, next: Next, a: string, b: string) {
                expect(a).toEqual('a')
                expect(b).toEqual('b')
                ctx.status = 200
            }
        })
    })
    it('can route simple route', async () => {
        await get('/id', {
            'id': {
                method: 'GET',
                handler: async function (ctx: Ctx, next: Next, a: string, b: string) {
                    ctx.status = 200
                }
            }
        })
    })
    it('can route a simple route with trailing slash', async () => {
        await get('/id/', {
            'id': {
                method: 'GET',
                handler: async function (ctx: Ctx, next: Next, a: string, b: string) {
                    ctx.status = 200
                }
            }
        })
    })
    describe('storage', () => {
        const routes: Route = {
            'id': {
                method: 'GET',
                handler: async function (ctx, next) {
                    ctx.status = 200
                }
            },
            'storage': [
                {
                    'fetch': [
                        {
                            method: 'HEAD',
                            handler: async function (ctx, next) {
                                ctx.status = 200
                            }
                        },
                        {
                            method: 'PUT',
                            body: fetchSchema,
                            handler: async function (ctx, next, request: { address: string, container: string}) {
                                ctx.status = 200
                                ctx.body = request
                            }
                        }
                    ]
                },
                {
                    method: 'HEAD',
                    params: [codeConverter],
                    handler: async function (ctx, next, address) {
                        ctx.status = 200
                        ctx.body = address
                    }
                },
                {
                    method: 'GET',
                    params: [codeConverter],
                    handler: async function (ctx, next, address) {
                        ctx.status = 200
                        ctx.body = address
                    }
                },
                {
                    method: 'PUT',
                    params: [codeConverter],
                    handler: async function (ctx, next, address) {
                        ctx.status = 200
                        ctx.body = address
                    }
                },
                {
                    method: 'POST',
                    handler: async function (ctx, next) {
                        ctx.status = 200
                    }
                }
            ]
        }

        it('can GET /id/', async () => {
            await get('/id', routes)
        })
        it('can HEAD /storage/fetch', async () => {
            await head('/storage/fetch', routes)
        })
        it('can PUT /storage/fetch', async () => {
            const data = { address: randomId(), container: randomId() }
            const request = dataToReadable(jsonData(data))
            const ctx = await put('/storage/fetch', routes, request)
            expect(ctx.body).toEqual(data)
        })
        it('can HEAD /storage/<id>', async () => {
            const id = randomId()
            const ctx = await head(`/storage/${id}`, routes)
            expect(ctx.body).toEqual(id)
        })
        it('can GET /storage/<id>', async () => {
            const id = randomId()
            const ctx = await get(`/storage/${id}`, routes)
            expect(ctx.body).toEqual(id)
        })
        it('can PUT /storage/<id>', async () => {
            const id = randomId()
            const ctx = await put(`/storage/${id}`, routes)
            expect(ctx.body).toEqual(id)
        })
        it('can POST /storage/', async () => {
            await post(`/storage/`, routes)
        })
    })
    describe('files', () => {
        const routes: Route = {
            'files': [{
                'mount': {
                    method: 'POST',
                    body: contentLinkSchema,
                    handler: async (ctx, next, content: ContentLink) => {
                        ctx.status = 200
                        ctx.body = content
                    }
                },
                'unmount': {
                    method: 'POST',
                    params: [nodeSchema],
                    handler: async (ctx, next, node: Node) => {
                        ctx.status = 200
                        ctx.body = node
                    }
                },
                'info': {
                    method: 'GET',
                    params: [nodeSchema],
                    handler: async (ctx, next, node: Node) => {
                        ctx.status = 200
                        ctx.body = node
                    }
                },
                'lookup': {
                    method: 'GET',
                    params: [nodeSchema, convertString],
                    handler: async (ctx, next, parent: number, name: string) => {
                        ctx.body = { parent, name }
                        ctx.status = 200
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
                        ctx.body = { query, parent }
                        ctx.status = 200
                    }
                },
                'remove': {
                    method: 'POST',
                    params: [nodeSchema, convertString],
                    handler: async (ctx, next, parent: Node, name: string) => {
                        ctx.body = { parent, name }
                        ctx.status = 200
                    }
                },
                'attributes': {
                    method: 'PUT',
                    params: [nodeSchema],
                    body: attributesSchema,
                    handler: async (ctx, next, node, attributes: EntryAttributes) => {
                        ctx.body = { node, attributes }
                        ctx.status = 200
                    }
                },
                'size': {
                    method: 'PUT',
                    params: [nodeSchema, nonNegativeIntSchema],
                    handler: async (ctx, next, node, size) => {
                        ctx.body = { node, size }
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
                    handler: async (ctx, next, query, parent, name) => {
                        ctx.body = { parent, query, name }
                        ctx.status = 200
                    }
                },
                'link': {
                    method: 'PUT',
                    params: [nodeSchema, convertString],
                    query: { 'node': offsetOrLength },
                    handler: async (ctx, next, query, parent, name) => {
                        ctx.body = { parent, query, name}
                        ctx.status = 200
                    }
                },
                'sync': {
                    method: 'PUT',
                    handler: async (ctx, next) => {
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
                    ctx.body = { query, node }
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
                    ctx.body = { query, node }
                    ctx.status = 200
                }
            }, {
                method: 'PUT',
                params: [nodeSchema, convertString],
                query: {
                    'kind': contentKind,
                },
                handler: async (ctx, next, query, parent, name) => {
                    ctx.body = { query, parent, name}
                    ctx.status = 200
                }
            }]
        }

        it('can POST /files/mount', async () => {
            const data = { address: randomId() }
            const request = dataToReadable(jsonData(data))
            const ctx = await post('/files/mount', routes, request)
            expect(ctx.body).toEqual(data)
        })
        it('can POST /files/unmount', async () => {
            const ctx = await post('/files/unmount/1', routes)
            expect(ctx.body).toEqual(1)
        })
        it('can GET /files/info', async () => {
            const ctx = await get('/files/info/1', routes)
            expect(ctx.body).toEqual(1)
        })
        it('can GET /files/lookup', async () => {
            const ctx = await get('/files/lookup/1/foo', routes)
            expect(ctx.body).toEqual({ parent: 1, name: 'foo' })
        })
        it('can GET /files/directory', async () => {
            const ctx = await get('/files/directory/1?offset=10&length=20', routes)
            expect(ctx.body).toEqual({ query: { offset: 10, length: 20 }, parent: 1 })
        })
        it('can POST /files/remove', async () => {
            const ctx = await post('/files/remove/1/foo', routes)
            expect(ctx.body).toEqual({ parent: 1, name: 'foo' })
        })
        it('can PUT /files/attributes', async () => {
            const data = { executable: true, writable: false, type: 'text/plain'}
            const request = dataToReadable(jsonData(data))
            const ctx = await put('/files/attributes/2', routes, request)
            expect(ctx.body).toEqual({ node: 2, attributes: data })
        })
        it('can PUT /files/size', async () => {
            const ctx = await put('/files/size/3/1024', routes)
            expect(ctx.body).toEqual({ node: 3, size: 1024 })
        })
        it('can PUT /files/rename', async () => {
            const ctx = await put('/files/rename/1/foo?newName=bar&newParent=5', routes)
            expect(ctx.body).toEqual({ parent: 1, name: 'foo', query: { newName: 'bar', newParent: 5}})
        })
        it('can PUT /files/link', async () => {
            const ctx = await put('/files/link/1/bar?node=42', routes)
            expect(ctx.body).toEqual({ parent: 1, name: 'bar', query: { node: 42 } })
        })
        it('can PUT /files/sync', async () => {
            await put('/files/sync', routes)
        })
        it('can GET /files/<node>', async () => {
            expect((await get('/files/42', routes)).body).toEqual({ query: { offset: undefined, length: undefined }, node: 42 })
            expect((await get('/files/42?offset=1024', routes)).body).toEqual({ query: { offset: 1024, length: undefined }, node: 42 })
            expect((await get('/files/42?length=1024', routes)).body).toEqual({ query: { offset: undefined, length: 1024 }, node: 42 })
            expect((await get('/files/42?offset=1024&length=2048', routes)).body).toEqual({ query: { offset: 1024, length: 2048 }, node: 42 })
        })
        it('can POST /files/<node>', async () => {
            expect((await post('/files/42', routes)).body).toEqual({ query: { offset: undefined, length: undefined }, node: 42 })
            expect((await post('/files/42?offset=1024', routes)).body).toEqual({ query: { offset: 1024, length: undefined }, node: 42 })
            expect((await post('/files/42?length=1024', routes)).body).toEqual({ query: { offset: undefined, length: 1024 }, node: 42 })
            expect((await post('/files/42?offset=1024&length=2048', routes)).body).toEqual({ query: { offset: 1024, length: 2048 }, node: 42 })
        })
        it('can PUT /files/<node>/<name>', async () => {
            expect((await put('/files/42/foo', routes)).body).toEqual({ parent: 42, name: 'foo', query: { kind: undefined }})
            expect((await put('/files/42/foo?kind=File', routes)).body).toEqual({ parent: 42, name: 'foo', query: { kind: 'File' }})
            expect((await put('/files/42/foo?kind=Directory', routes)).body).toEqual({ parent: 42, name: 'foo', query: { kind: 'Directory' }})
        })
    })
    describe('find', () => {
        const routes: Route = {
            'id': {
                method: 'GET',
                handler: async function (ctx, next) {
                    ctx.status = 200
                }
            },
            'find': [
                {
                    'has': {
                        method: 'PUT',
                        body: findHasRequestSchema,
                        handler: async function (ctx, next, { container, ids }: FindHasRequest) {
                            ctx.body = { container, ids }
                            ctx.status = 200
                        }
                    },
                    'notify': {
                        method: 'PUT',
                        body: findNotifyRequestSchema,
                        handler: async function (ctx, next, { find }: FindNotifyRequest) {
                            ctx.body = { find }
                            ctx.status = 200
                        }
                    }
                },
                {
                    method: 'GET',
                    params: [codeConverter],
                    handler: async function (ctx, next, id) {
                        ctx.status = 200
                        ctx.body = id
                    }
                }
            ]
        }
        it('can GET /id', async () => {
            await get('/id', routes)
        })
        it('can PUT /find/has', async () => {
            const data = { container: randomId(), ids: [ randomId(), randomId() ]}
            const request = dataToReadable(jsonData(data))
            const ctx = await put('/find/has', routes, request)
            expect(ctx.body).toEqual(data)
        })
        it('can PUT /find/notify', async () => {
            const data = { find: randomId() }
            const request = dataToReadable(jsonData(data))
            const ctx = await put('/find/notify', routes, request)
            expect(ctx.body).toEqual(data)
        })
        it('can GET /find/<id>', async () => {
            const id = randomId()
            const ctx = await get(`/find/${id}`, routes)
            expect(ctx.body).toEqual(id)
        })
    })
    describe('slots', () => {
        const routes: Route = {
            'id': {
                method: 'GET',
                handler: async function (ctx, next) {
                    ctx.status = 200
                }
            },
            'slots': [{
                'register': {
                    method: 'PUT',
                    body: registerSchema,
                    handler: async function (ctx, next, request: SlotsRegisterRequest) {
                        ctx.body = request
                        ctx.status = 200
                    }
                },
                'config': {
                    method: 'GET',
                    params: [codeConverter],
                    handler: async function (ctx, next, id) {
                        ctx.body = id
                        ctx.status = 200
                    }
                },
                'history': {
                    method: 'GET',
                    params: [codeConverter],
                    handler: async function (ctx, next, id) {
                        ctx.body = id
                        ctx.status = 200
                    }
                }
            }, {
                method: 'GET',
                params: [codeConverter],
                handler: async function (ctx, next, id) {
                    ctx.body = id
                    ctx.status = 200
                }
            }, {
                method: 'PUT',
                params: [codeConverter],
                body: putSchema,
                handler: async function (ctx, next, id, request: SlotsPutRequest) {
                    ctx.body = { id, request }
                    ctx.status = 200
                }
            }]
        }

        it('can GET /id', async () => {
            await get('/id', routes)
        })
        it('can PUT /slots/register', async () => {
            const data = { id: randomId(), address: randomId() }
            const request = dataToReadable(jsonData(data))
            const ctx = await put('/slots/register', routes, request)
            expect(ctx.body).toEqual(data)
        })
        it('can GET /slots/config', async () => {
            const id = randomId()
            const ctx = await get(`/slots/config/${id}`, routes)
            expect(ctx.body).toEqual(id)
        })
        it('can GET /slots/history', async () => {
            const id = randomId()
            const ctx = await get(`/slots/history/${id}`, routes)
            expect(ctx.body).toEqual(id)
        })
        it('can GET /slots/<id>', async () => {
            const id = randomId()
            const ctx = await get(`/slots/${id}`, routes)
            expect(ctx.body).toEqual(id)
        })
        it('can PUT /slots/<id>', async () => {
            const id = randomId()
            const data = { previous: randomId(), address: randomId() }
            const request = dataToReadable(jsonData(data))
            const ctx = await put(`/slots/${id}`, routes, request)
            expect(ctx.body).toEqual({ id, request: data })
        })
    })
    describe('broker', () => {
        const routes: Route = {
            'id': {
                method: 'GET',
                handler: async function (ctx, next) {
                    ctx.status = 200
                }
            },
            'broker': {
                'location': {
                    method: 'GET',
                    params: [codeConverter],
                    handler: async function (ctx, next, id) {
                        ctx.body = id
                        ctx.status = 200
                    }

                },
                'register': {
                    method: 'POST',
                    body: brokerRegisterRequestSchema,
                    handler: async function (ctx, next, request: BrokerRegisterRequest) {
                        ctx.body = request
                        ctx.status = 200
                    }
                },
                'registered': {
                    method: 'GET',
                    params: [kindConverter],
                    handler: async function (ctx, next, kind) {
                        ctx.body = kind
                        ctx.status = 200
                    }
                }
            }
        }
        it('can GET /id', async () => {
            await get('/id', routes)
        })
        it('can GET /broker/location', async () => {
            const id = randomId()
            const ctx = await get(`/broker/location/${id}`, routes)
            expect(ctx.body).toEqual(id)
        })
        it('can POST /broker/register', async () => {
            const data = { id: randomId(), kind: 'find', url: 'http://localhost:3000' }
            const request = dataToReadable(jsonData(data))
            const ctx = await post('/broker/register', routes, request)
            expect(ctx.body).toEqual(data)
        })
        it('can GET /broker/registered', async () => {
            const ctx = await get('/broker/registered/find', routes)
            expect(ctx.body).toEqual('find')
        })
    })
    describe('productions', () => {
        const routes: Route = {
            'id': {
                method: 'GET',
                handler: async function (ctx, next) {
                    ctx.status = 200
                }
            },
            'production': [
                {
                    method: 'GET',
                    params: [codeConverter, codeConverter],
                    handler: async function (ctx, next, task, input) {
                        ctx.body = { task, input }
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
                        ctx.body = { output, task, input }
                        ctx.status = 200
                    }
                }
            ]
        }

        it('can GET /id', async () => {
            await get('/id', routes)
        })
        it('can GET /production/<id>/<id>', async () => {
            const task = randomId()
            const input = randomId()
            const ctx = await get(`/production/${task}/${input}`, routes)
            expect(ctx.body).toEqual({ task, input})
        })
        it('can PUT /production/<id>/<id>', async () => {
            const task = randomId()
            const input = randomId()
            const output = randomId()
            const ctx = await put(`/production/${task}/${input}?output=${output}`, routes)
            expect(ctx.body).toEqual({ task, input, output })
        })
    })
})

async function navigate(method: string, path: string, routes: Route, req?: any): Promise<Ctx> {
    const url = new URL(`http://localhost${path}`)
    const ctx = { method, path: url.pathname, status: 404 } as Ctx
    if (url.searchParams) {
        ctx.query = searchToQuery(url.searchParams)
    }
    if (req) ctx.req = req
    const next = (() => undefined) as any as Next
    await route(routes, ctx, next)
    expect(ctx.status).toEqual(200)
    return ctx
}

async function get(path: string, routes: Route): Promise<Ctx> {
    return await navigate('GET', path, routes)
}

async function head(path: string, routes: Route): Promise<Ctx> {
    return await navigate('HEAD', path, routes)
}

async function put(path: string, routes: Route, body?: any): Promise<Ctx> {
    return await navigate('PUT', path, routes, body)
}

async function post(path: string, routes: Route, body?: any): Promise<Ctx> {
    return await navigate('POST', path, routes, body)
}

function anyParam(param: any): string {
    return param
}

function jsonData(data: any): Data {
    const text = JSON.stringify(data)
    return dataFromString(text)
}

function searchToQuery(searchParams: Iterable<[string, string]>): any {
    const result: any = {}
    for (const [name, value] of searchParams) {
        result[name] = value
    }
    return result
}