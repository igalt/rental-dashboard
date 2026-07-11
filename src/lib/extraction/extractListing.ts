import { LLMCaller, defaultLLMCaller } from '../llm/client';

export interface ExtractedListing {
  title: string | null;
  price: number | null;
  rooms: number | null;
  area: string | null;
  move_in_date: string | null;
}

const EMPTY: ExtractedListing = { title: null, price: null, rooms: null, area: null, move_in_date: null };

export async function extractListing(
  rawText: string,
  caller: LLMCaller = defaultLLMCaller
): Promise<ExtractedListing> {
  const prompt = `Extract rental listing fields from the text below as strict JSON with keys title, price (number or null), rooms (number or null), area (string or null), move_in_date (YYYY-MM-DD string or null). Only return the JSON object, nothing else.

Text:
${rawText}`;

  const responseText = await caller(prompt);
  const jsonText = extractJsonObject(responseText);
  if (jsonText === null) return EMPTY;

  try {
    return { ...EMPTY, ...JSON.parse(jsonText) };
  } catch {
    return EMPTY;
  }
}

/**
 * Pulls the first JSON object out of a raw LLM response. Strips markdown
 * code fences, then finds the first `{` and its true matching `}` by
 * brace-depth counting so trailing prose containing its own braces
 * (parentheticals, other code fences, etc.) can't extend the match past
 * the real object.
 */
function extractJsonObject(text: string): string | null {
  const stripped = text.replace(/```(?:json)?/gi, '');

  const start = stripped.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  for (let i = start; i < stripped.length; i++) {
    if (stripped[i] === '{') depth++;
    else if (stripped[i] === '}') {
      depth--;
      if (depth === 0) return stripped.slice(start, i + 1);
    }
  }

  return null;
}
