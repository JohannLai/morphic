import { createStreamableUI, createStreamableValue } from 'ai/rsc'
import {
  ExperimentalMessage,
  ToolCallPart,
  ToolResultPart,
  experimental_streamText
} from 'ai'
import { summarizeSchema } from '@/lib/schema/summarize'
import { Section } from '@/components/section'
import { OpenAI } from '@ai-sdk/openai'
import { ToolBadge } from '@/components/tool-badge'
import { SearchSkeleton } from '@/components/search-skeleton'
import { BotMessage } from '@/components/message'
import { Card } from '@/components/ui/card'

export async function summarize(
  uiStream: ReturnType<typeof createStreamableUI>,
  streamText: ReturnType<typeof createStreamableValue<string>>,
  messages: ExperimentalMessage[],
  useSpecificModel?: boolean
) {
  const openai = new OpenAI({
    baseUrl: process.env.OPENAI_API_BASE, // optional base URL for proxies etc.
    apiKey: process.env.OPENAI_API_KEY, // optional API key, default to env property OPENAI_API_KEY
    organization: '' // optional organization
  })

  let fullResponse = ''
  let hasError = false
  const answerSection = (
    <Section title="Answer">
      <BotMessage content={streamText.value} />
    </Section>
  )

  const result = await experimental_streamText({
    model: openai.chat(process.env.OPENAI_API_MODEL || 'gpt-4-turbo'),
    maxTokens: 4096,
    system: `As a professional summariser, you have the ability to use a url and summarise its details.
    For each user query, make full use of the summarised results to provide more information and help with your response.
    Please match the language of the response to the user's language.
    `,
    messages,
    tools: {
      search: {
        description: 'Summarize the web page content by provide a url',
        parameters: summarizeSchema,
        execute: async ({ url }: { url: string }) => {
          uiStream.update(
            <Section>
              <ToolBadge tool="summarize">{`${url}`}</ToolBadge>
            </Section>
          )

          uiStream.append(
            <Section>
              <SearchSkeleton />
            </Section>
          )

          let summarizeResult
          try {
            summarizeResult = await hermGoSummarize(url)
          } catch (error) {
            console.error('Search API error:', error)
            hasError = true
          }

          if (hasError) {
            fullResponse += `\nAn error occurred while summarizing for "${url}.`
            uiStream.update(
              <Card className="p-4 mt-2 text-sm">
                {`An error occurred while summarizing for "${url}".`}
              </Card>
            )
            return summarizeResult
          }

          // Append the answer section if the specific model is not used
          if (!useSpecificModel) {
            uiStream.append(answerSection)
          }

          return summarizeResult
        }
      }
    }
  })

  const toolCalls: ToolCallPart[] = []
  const toolResponses: ToolResultPart[] = []
  for await (const delta of result.fullStream) {
    switch (delta.type) {
      case 'text-delta':
        if (delta.textDelta) {
          // If the first text delata is available, add a ui section
          if (fullResponse.length === 0 && delta.textDelta.length > 0) {
            // Update the UI
            uiStream.update(answerSection)
          }

          fullResponse += delta.textDelta
          streamText.update(fullResponse)
        }
        break
      case 'tool-call':
        toolCalls.push(delta)
        break
      case 'tool-result':
        toolResponses.push(delta)
        break
      case 'error':
        hasError = true
        fullResponse += `\nError occurred while executing the tool`
        break
    }
  }
  messages.push({
    role: 'assistant',
    content: [{ type: 'text', text: fullResponse }, ...toolCalls]
  })

  if (toolResponses.length > 0) {
    // Add tool responses to the messages
    messages.push({ role: 'tool', content: toolResponses })
  }

  return { result, fullResponse, hasError, toolResponses }
}

async function hermGoSummarize(url: string) {
  const response = await fetch(
    `https://hermgo-api.vercel.app/api/summarize?url=${url}`,
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    }
  )

  if (!response.ok) {
    throw new Error(`hermgo Error: ${response.status}`)
  }

  const { data } = await response.json()

  console.log('hermgo summarize data:', data)

  return data
}
