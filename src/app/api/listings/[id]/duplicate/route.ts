import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '../../../../../lib/supabase/server';

interface RouteContext {
  params: Promise<{ id: string }>;
}

interface ListingRecord {
  id: string;
  possible_duplicate_of?: string | null;
  updated_at?: string;
}

// Fetches a single listing by id, returning null on error or a missing row instead
// of throwing — callers turn that into an honest 404 rather than a raw postgrest error.
async function getListingOrNull(
  supabase: ReturnType<typeof getServiceClient>,
  id: string,
  columns: string
): Promise<ListingRecord | null> {
  const { data, error } = await supabase.from('listings').select(columns).eq('id', id).single();
  if (error || !data) return null;
  // supabase-js can only statically parse a literal column-string into a precise row type;
  // a dynamic `string` param degrades to its GenericStringError placeholder type, so an
  // unknown-mediated cast is the correct (not merely convenient) escape hatch here.
  return data as unknown as ListingRecord;
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: 'invalid request body' }, { status: 400 });
  }
  const { action } = body as Record<string, unknown>;

  const supabase = getServiceClient();

  if (action === 'dismiss') {
    // Confirm the row exists before mutating it, so an unknown id gets an honest
    // 404 instead of whatever shape postgrest's "no rows" error happens to take.
    const existing = await getListingOrNull(supabase, id, 'id');
    if (!existing) {
      return NextResponse.json({ error: 'listing not found' }, { status: 404 });
    }

    const { data, error } = await supabase
      .from('listings')
      .update({ possible_duplicate_of: null })
      .eq('id', id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ listing: data });
  }

  if (action === 'merge') {
    const current = await getListingOrNull(supabase, id, 'id, possible_duplicate_of, updated_at');
    if (!current) {
      return NextResponse.json({ error: 'listing not found' }, { status: 404 });
    }

    if (!current.possible_duplicate_of) {
      return NextResponse.json({ error: 'no duplicate to merge' }, { status: 400 });
    }

    const other = await getListingOrNull(supabase, current.possible_duplicate_of, 'id, updated_at');
    if (!other) {
      return NextResponse.json({ error: 'duplicate listing not found' }, { status: 404 });
    }

    // Per spec: keep whichever record was more recently updated, mark the other irrelevant.
    // Neither record's favorited/notes/irrelevant needs copying — the survivor already
    // has its own values; we only need to correctly identify which one loses.
    const currentIsNewer = new Date(current.updated_at!) >= new Date(other.updated_at!);
    const loserId = currentIsNewer ? other.id : current.id;

    // Re-confirm the loser row right before flipping it irrelevant (guards against it
    // having been deleted between the fetch above and now).
    const loser = await getListingOrNull(supabase, loserId, 'id');
    if (!loser) {
      return NextResponse.json({ error: 'duplicate listing not found' }, { status: 404 });
    }

    // Mark the loser irrelevant BEFORE clearing the duplicate-flag pointer. If the pointer
    // were cleared first and this update then failed, the pointer would already be gone
    // with no rollback — a retry would see possible_duplicate_of already null and bail
    // with "no duplicate to merge" (400), silently losing the original merge intent with
    // no recovery short of a manual DB fix. Doing it in this order means a failure here
    // leaves the pointer intact and the merge safely retriable.
    const { data, error } = await supabase
      .from('listings')
      .update({ irrelevant: true })
      .eq('id', loserId)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // The duplicate-flag pointer always lives on the requested record; clear it last,
    // now that the irrelevant flip has actually succeeded.
    const { error: clearError } = await supabase
      .from('listings')
      .update({ possible_duplicate_of: null })
      .eq('id', id);
    if (clearError) return NextResponse.json({ error: clearError.message }, { status: 500 });

    return NextResponse.json({ hidden: data });
  }

  return NextResponse.json({ error: 'action must be "merge" or "dismiss"' }, { status: 400 });
}
