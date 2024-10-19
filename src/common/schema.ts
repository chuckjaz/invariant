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

