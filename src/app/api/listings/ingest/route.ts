import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '../../../../lib/supabase/server';
import { extractListing } from '../../../../lib/extraction/extractListing';
import { findPossibleDuplicate } from '../../../../lib/dedup/findPossibleDuplicate';

interface IngestPayload {
  source: 'facebook' | 'whatsapp' | 'manual';
  raw_text: string;
  source_ref?: string;
}

function isAuthorized(request: NextRequest): boolean {
  return request.headers.get('authorization') === `Bearer ${process.env.INGEST_API_KEY}`;
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const payloads: IngestPayload[] = Array.isArray(body) ? body : [body];
  const supabase = getServiceClient();
  const inserted = [];

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
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    inserted.push(data);
  }

  return NextResponse.json({ inserted });
}
