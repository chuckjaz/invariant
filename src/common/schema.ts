import { z } from 'zod'

export const idSchema = z.string().transform((arg, ctx) => {
    try {
        return Buffer.from(arg, 'hex').toString('hex')
    } catch (e) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'id must be a hex string'
        })
        return arg
    }
})

export const contentLinkSchema = z.object({
    address: idSchema,
    slot: z.optional(z.boolean()),
    key: z.optional(z.string()),
    algorithm: z.optional(z.string()),
    salt: z.optional(z.string()),
    blockTree: z.optional(z.boolean()),
    primary: z.optional(idSchema),
})

export const blockSchema = z.object({
    content: contentLinkSchema,
    size: z.number()
})

export const blockTreeSchema = z.array(blockSchema)

export const entryKindSchema = z.enum(["File", "Directory"])

export const entrySchema = z.object({
    kind: entryKindSchema,
    name: z.string(),
    content: contentLinkSchema,
    createTime: z.optional(z.number()),
    modifyTime: z.optional(z.number()),
    type: z.optional(z.string()),
    mode: z.optional(z.string()),
})

export const directorySchema = z.array(entrySchema)
