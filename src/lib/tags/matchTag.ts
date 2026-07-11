import { LLMCaller, defaultLLMCaller } from '../llm/client';
import type { MatchStatus } from '../../types/listing';

export async function matchTag(
  rawText: string,
  tagLabel: string,
  caller: LLMCaller = defaultLLMCaller
): Promise<MatchStatus> {
  const prompt = `Does the following rental listing match this criterion: "${tagLabel}"? Reply with exactly one word: matched, unmatched, or unclear.

Listing text:
${rawText}`;

  const response = (await caller(prompt)).trim().toLowerCase();
  // Check "unmatched" before "matched" — "unmatched" contains "matched" as a substring.
  if (response.includes('unmatched')) return 'unmatched';
  if (response.includes('matched')) return 'matched';
  return 'unclear';
}
