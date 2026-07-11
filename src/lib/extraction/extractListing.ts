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
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return EMPTY;

  try {
    return { ...EMPTY, ...JSON.parse(jsonMatch[0]) };
  } catch {
    return EMPTY;
  }
}
