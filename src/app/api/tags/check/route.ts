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
  const table = (body as Record<string, unknown>).table;
  const type = (body as Record<string, unknown>).type;
  const record = (body as Record<string, unknown>).record;
  // Only treat `record.id` as a listing id when the payload is actually a
  // listings-INSERT webhook — otherwise any payload shaped like { record: { id } }
  // (e.g. an UPDATE, or a webhook on a different table) would be misread as one.
  const isListingsInsertWebhook = table === 'listings' && type === 'INSERT';
  const recordId =
    isListingsInsertWebhook && record && typeof record === 'object'
      ? (record as Record<string, unknown>).id
      : undefined;
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

    // Capped as a safety valve against pathological growth; at this app's expected
    // scale (a two-person household search) this won't realistically bind. A future
    // resumable/paginated sweep would be needed if that assumption stops holding.
    const { data: tags, error: tagsError } = await supabase.from('tags').select('id, label').limit(500);
    if (tagsError) return NextResponse.json({ error: tagsError.message }, { status: 500 });

    const tagsList = (tags as { id: string; label: string }[]) ?? [];
    let failures = 0;
    for (const tag of tagsList) {
      const matchStatus = await matchTag((listing as { raw_text: string }).raw_text ?? '', tag.label);
      const { error: upsertError } = await supabase.from('listing_tags').upsert({
        listing_id: (listing as { id: string }).id,
        tag_id: tag.id,
        match_status: matchStatus,
        checked_at: new Date().toISOString(),
      });
      if (upsertError) {
        console.error('Failed to upsert listing_tags', {
          listing_id: (listing as { id: string }).id,
          tag_id: tag.id,
          error: upsertError,
        });
        failures++;
      }
    }
    const status = tagsList.length > 0 && failures === tagsList.length ? 500 : 200;
    return NextResponse.json({ checked: tagsList.length, failed: failures }, { status });
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

    // Capped as a safety valve against pathological growth; at this app's expected
    // scale (a two-person household search) this won't realistically bind. A future
    // resumable/paginated sweep would be needed if that assumption stops holding.
    const { data: listings, error: listingsError } = await supabase
      .from('listings')
      .select('id, raw_text')
      .limit(500);
    if (listingsError) return NextResponse.json({ error: listingsError.message }, { status: 500 });

    const listingsList = (listings as { id: string; raw_text: string }[]) ?? [];
    let failures = 0;
    for (const listing of listingsList) {
      const matchStatus = await matchTag(listing.raw_text ?? '', (tag as { label: string }).label);
      const { error: upsertError } = await supabase.from('listing_tags').upsert({
        listing_id: listing.id,
        tag_id: (tag as { id: string }).id,
        match_status: matchStatus,
        checked_at: new Date().toISOString(),
      });
      if (upsertError) {
        console.error('Failed to upsert listing_tags', {
          listing_id: listing.id,
          tag_id: (tag as { id: string }).id,
          error: upsertError,
        });
        failures++;
      }
    }
    const status = listingsList.length > 0 && failures === listingsList.length ? 500 : 200;
    return NextResponse.json({ checked: listingsList.length, failed: failures }, { status });
  }

  return NextResponse.json({ error: 'listing_id or tag_id required' }, { status: 400 });
}
