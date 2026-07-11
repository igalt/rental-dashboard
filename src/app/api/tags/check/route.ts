import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '../../../../lib/supabase/server';
import { matchTag } from '../../../../lib/tags/matchTag';

function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.INGEST_API_KEY;
  if (!expected) return false; // fail closed — never compare against the literal "Bearer undefined"
  return request.headers.get('authorization') === `Bearer ${expected}`;
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

  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'invalid request body' }, { status: 400 });
  }

  // Supabase Database Webhooks send { type, table, record, schema, old_record }.
  // The new-tag sweep (triggered from our own tag-creation route) sends { tag_id }.
  const record = (body as Record<string, unknown>).record;
  const recordId =
    record && typeof record === 'object' ? (record as Record<string, unknown>).id : undefined;
  const listingId: unknown = recordId ?? (body as Record<string, unknown>).listing_id;
  const tagId: unknown = (body as Record<string, unknown>).tag_id;

  const supabase = getServiceClient();

  if (typeof listingId === 'string' && listingId.length > 0) {
    const { data: listing, error: listingError } = await supabase
      .from('listings')
      .select('id, raw_text')
      .eq('id', listingId)
      .single();
    if (listingError || !listing) {
      return NextResponse.json({ error: 'listing not found' }, { status: 404 });
    }

    const { data: tags, error: tagsError } = await supabase.from('tags').select('id, label');
    if (tagsError) return NextResponse.json({ error: tagsError.message }, { status: 500 });

    for (const tag of (tags as { id: string; label: string }[]) ?? []) {
      const matchStatus = await matchTag((listing as { raw_text: string }).raw_text ?? '', tag.label);
      await supabase.from('listing_tags').upsert({
        listing_id: (listing as { id: string }).id,
        tag_id: tag.id,
        match_status: matchStatus,
        checked_at: new Date().toISOString(),
      });
    }
    return NextResponse.json({ checked: tags?.length ?? 0 });
  }

  if (typeof tagId === 'string' && tagId.length > 0) {
    const { data: tag, error: tagError } = await supabase
      .from('tags')
      .select('id, label')
      .eq('id', tagId)
      .single();
    if (tagError || !tag) {
      return NextResponse.json({ error: 'tag not found' }, { status: 404 });
    }

    const { data: listings, error: listingsError } = await supabase.from('listings').select('id, raw_text');
    if (listingsError) return NextResponse.json({ error: listingsError.message }, { status: 500 });

    for (const listing of (listings as { id: string; raw_text: string }[]) ?? []) {
      const matchStatus = await matchTag(listing.raw_text ?? '', (tag as { label: string }).label);
      await supabase.from('listing_tags').upsert({
        listing_id: listing.id,
        tag_id: (tag as { id: string }).id,
        match_status: matchStatus,
        checked_at: new Date().toISOString(),
      });
    }
    return NextResponse.json({ checked: listings?.length ?? 0 });
  }

  return NextResponse.json({ error: 'listing_id or tag_id required' }, { status: 400 });
}
