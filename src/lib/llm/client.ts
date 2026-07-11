import Anthropic from '@anthropic-ai/sdk';

export type LLMCaller = (prompt: string) => Promise<string>;

export const defaultLLMCaller: LLMCaller = async (prompt) => {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const message = await client.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 500,
    messages: [{ role: 'user', content: prompt }],
  });
  const block = message.content[0];
  return block.type === 'text' ? block.text : '';
};
