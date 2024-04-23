import { DeepPartial } from 'ai'
import { z } from 'zod'

export const summarizeSchema = z.object({
  url: z.string().describe('The URL to summarize')
})

export type PartialInquiry = DeepPartial<typeof summarizeSchema>
