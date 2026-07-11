import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '../../../../lib/supabase/server';
import { extractListing } from '../../../../lib/extraction/extractListing';
import { findPossibleDuplicate } from '../../../../lib/dedup/findPossibleDuplicate';

interface IngestPayload {
  source: 'facebook' | 'whatsapp' | 'manual';
  raw_text: string;
  source_ref?: string;
}

const ALLOWED_SOURCES = ['facebook', 'whatsapp', 'manual'];
const MAX_BATCH_SIZE = 50;

function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.INGEST_API_KEY;
  if (!expected) return false; // fail closed — never compare against the literal "Bearer undefined"
  return request.headers.get('authorization') === `Bearer ${expected}`;
}

/** Returns an error message for the first invalid field found, or null if the payload is valid. */
function validatePayload(payload: unknown, index: number): string | null {
  if (typeof payload !== 'object' || payload === null) {
    return `payload at index ${index} must be an object`;
  }
  const { source, raw_text } = payload as Record<string, unknown>;
  if (typeof source !== 'string' || !ALLOWED_SOURCES.includes(source)) {
    return `payload at index ${index}: source must be one of ${ALLOWED_SOURCES.join(', ')}`;
  }
  if (typeof raw_text !== 'string' || raw_text.trim().length === 0) {
    return `payload at index ${index}: raw_text must be a non-empty string`;
  }
  return null;
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const rawPayloads = Array.isArray(body) ? body : [body];

  if (rawPayloads.length > MAX_BATCH_SIZE) {
    return NextResponse.json(
      { error: `batch size exceeds maximum of ${MAX_BATCH_SIZE} payloads` },
      { status: 400 }
    );
  }

  for (let i = 0; i < rawPayloads.length; i++) {
    const validationError = validatePayload(rawPayloads[i], i);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }
  }

  const payloads = rawPayloads as IngestPayload[];
  const supabase = getServiceClient();
  const inserted = [];

  // Batch calls are processed sequentially and are not atomic: if an insert
  // fails partway through, earlier payloads in the same request remain
  // committed with no rollback. Callers that need all-or-nothing semantics
  // should currently send one payload per request.
  for (const payload of payloads) {
    const extracted = await extractListing(payload.raw_text);
    const duplicateId = await findPossibleDuplicate(supabase, {
      price: extracted.price,
      rooms: extracted.rooms,
      area: extracted.area,
    });

    const { data, error } = await supabase
      .from('listings')
      .insert({
        source: payload.source,
        source_ref: payload.source_ref ?? null,
        title: extracted.title,
        price: extracted.price,
        rooms: extracted.rooms,
        area: extracted.area,
        move_in_date: extracted.move_in_date,
        raw_text: payload.raw_text,
        possible_duplicate_of: duplicateId,
      })
      .select()
      .single();

    if (error) {
      console.error('Failed to insert listing during ingest:', error);
      return NextResponse.json({ error: 'failed to save listing' }, { status: 500 });
    }
    inserted.push(data);
  }

  return NextResponse.json({ inserted });
}
