import { jsonFromData } from "../common/data"
import { contentLinkSchema, dateSchema } from "../common/schema"
import { ContentLink } from "../common/types"
import { z } from 'zod'
import { Data } from "../storage/storage_client"
import { dataFromString } from "../common/parseJson"
import { invalid } from "../common/errors"

export interface Workspace {
    workspaceSlot: ContentLink
    inputSlot: ContentLink
    outputSlot: ContentLink
    upstreamSlot: ContentLink
    baseCommit: ContentLink
}

export interface Commit {
    date: string
    author: string
    committer: string
    message: string
    content: ContentLink
    parents: ContentLink[]
    refs?: NamedRef[]
}

export interface NamedRef {
    name: string
    content: ContentLink
}

export const namedRefSchema = z.object({
    name: z.string(),
    content: contentLinkSchema
})

export const commitSchema = z.object({
    date: dateSchema,
    author: z.string(),
    committer: z.string(),
    message: z.string(),
    content: contentLinkSchema,
    parents: z.array(contentLinkSchema),
    refs: z.array(namedRefSchema).optional()
})

export const workspaceSchema = z.object({
    workspaceSlot: contentLinkSchema,
    inputSlot: contentLinkSchema,
    outputSlot: contentLinkSchema,
    upstreamSlot: contentLinkSchema,
})

function parseData<Schema extends z.ZodType<any, any, any>, T = z.output<Schema>>(schema: Schema, data: Data) {
    const result = jsonFromData(schema, data) as (Promise<T> | undefined)
    if (!result) invalid("Incorrect JSON format");
    return result
}

function writeData(value: any): Data {
    return dataFromString(JSON.stringify(value))
}

export function workspaceFromData(data: Data): Promise<Workspace> {
    return parseData(workspaceSchema, data)
}

export function workspaceToData(workspace: Workspace): Data {
    return writeData(workspace)
}

export function commitToData(commit: Commit): Data {
    return writeData(commit)
}

export function commitFromData(data: Data): Promise<Commit> {
    return parseData(commitSchema, data)
}
