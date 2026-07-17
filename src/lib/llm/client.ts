import Anthropic from '@anthropic-ai/sdk';

export type LLMCaller = (prompt: string) => Promise<string>;

export const defaultLLMCaller: LLMCaller = async (prompt) => {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const message = await client.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 500,
    messages: [{ role: 'user', content: prompt }],
  });
  // Don't assume content[0] is the text block — extended-thinking responses put a
  // `thinking` block first, so the real answer can be at a later index.
  const block = message.content.find((b) => b.type === 'text');
  return block ? block.text : '';
};
