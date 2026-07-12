import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '../../../../../lib/supabase/server';

interface RouteContext {
  params: Promise<{ id: string }>;
}

interface ListingRecord {
  id: string;
  possible_duplicate_of?: string | null;
  updated_at: string;
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
    const { data: existing, error: existingError } = await supabase
      .from('listings')
      .select('id')
      .eq('id', id)
      .single();
    if (existingError || !existing) {
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
    const { data: current, error: currentError } = await supabase
      .from('listings')
      .select('id, possible_duplicate_of, updated_at')
      .eq('id', id)
      .single();
    if (currentError || !current) {
      return NextResponse.json({ error: 'listing not found' }, { status: 404 });
    }

    const currentRecord = current as ListingRecord;
    if (!currentRecord.possible_duplicate_of) {
      return NextResponse.json({ error: 'no duplicate to merge' }, { status: 400 });
    }

    const { data: other, error: otherError } = await supabase
      .from('listings')
      .select('id, updated_at')
      .eq('id', currentRecord.possible_duplicate_of)
      .single();
    if (otherError || !other) {
      return NextResponse.json({ error: 'duplicate listing not found' }, { status: 404 });
    }

    const otherRecord = other as ListingRecord;
    // Per spec: keep whichever record was more recently updated, mark the other irrelevant.
    // Neither record's favorited/notes/irrelevant needs copying — the survivor already
    // has its own values; we only need to correctly identify which one loses.
    const currentIsNewer = new Date(currentRecord.updated_at) >= new Date(otherRecord.updated_at);
    const loserId = currentIsNewer ? otherRecord.id : currentRecord.id;

    // The duplicate-flag pointer always lives on the requested record; clear it either way.
    const { error: clearError } = await supabase
      .from('listings')
      .update({ possible_duplicate_of: null })
      .eq('id', id);
    if (clearError) return NextResponse.json({ error: clearError.message }, { status: 500 });

    // Re-confirm the loser row right before flipping it irrelevant (guards against it
    // having been deleted between the fetch above and now).
    const { data: loser, error: loserError } = await supabase
      .from('listings')
      .select('id')
      .eq('id', loserId)
      .single();
    if (loserError || !loser) {
      return NextResponse.json({ error: 'duplicate listing not found' }, { status: 404 });
    }

    const { data, error } = await supabase
      .from('listings')
      .update({ irrelevant: true })
      .eq('id', loserId)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ hidden: data });
  }

  return NextResponse.json({ error: 'action must be "merge" or "dismiss"' }, { status: 400 });
}
