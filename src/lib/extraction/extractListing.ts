import { LLMCaller, defaultLLMCaller } from '../llm/client';

export type ListingType = 'rental' | 'sublet';

export interface ExtractedListing {
  title: string | null;
  price: number | null;
  rooms: number | null;
  area: string | null;
  move_in_date: string | null;
  listing_type: ListingType;
}

const EMPTY: ExtractedListing = {
  title: null,
  price: null,
  rooms: null,
  area: null,
  move_in_date: null,
  listing_type: 'rental',
};

export async function extractListing(
  rawText: string,
  caller: LLMCaller = defaultLLMCaller
): Promise<ExtractedListing> {
  const today = new Date().toISOString().slice(0, 10);
  const prompt = `Extract rental listing fields from the text below as strict JSON with keys title, price (number or null), rooms (number or null), area (string or null), move_in_date (YYYY-MM-DD string or null), listing_type ("sublet" or "rental").

Today's date is ${today}. The text may give move_in_date as a day/month with no year (e.g. "1.8" or "כניסה באוגוסט") — resolve it to the next occurrence of that date on or after today (rolling over to next year only if that month has already passed this year).

Use "sublet" only when the text itself signals a temporary stay in someone else's home for a bounded period — explicit words like "סאבלט"/"sublet", a short fixed date range (e.g. a single month), or the poster describing their own apartment as available while they're away. Use "rental" for an ordinary open-ended lease, and as the default whenever the distinction isn't clearly stated. Only return the JSON object, nothing else.

Text:
${rawText}`;

  const responseText = await caller(prompt);
  const jsonText = extractJsonObject(responseText);
  if (jsonText === null) return EMPTY;

  try {
    const parsed = JSON.parse(jsonText);
    if (parsed.listing_type !== 'sublet') parsed.listing_type = 'rental';
    return { ...EMPTY, ...parsed };
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
