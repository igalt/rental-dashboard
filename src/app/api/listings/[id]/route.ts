import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '../../../../lib/supabase/server';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
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
  const bodyRecord = body as Record<string, unknown>;

  const allowedFields = ['favorited', 'irrelevant', 'notes', 'status', 'title'] as const;
  const update: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (field in bodyRecord) update[field] = bodyRecord[field];
  }

  if ('favorited' in update && typeof update.favorited !== 'boolean') {
    return NextResponse.json({ error: 'favorited must be a boolean' }, { status: 400 });
  }
  if ('irrelevant' in update && typeof update.irrelevant !== 'boolean') {
    return NextResponse.json({ error: 'irrelevant must be a boolean' }, { status: 400 });
  }
  if ('notes' in update && update.notes !== null && typeof update.notes !== 'string') {
    return NextResponse.json({ error: 'notes must be a string or null' }, { status: 400 });
  }
  if ('status' in update && !['new', 'contacted', 'seen'].includes(update.status as string)) {
    return NextResponse.json({ error: 'status must be one of new, contacted, seen' }, { status: 400 });
  }
  if ('title' in update && (typeof update.title !== 'string' || update.title.trim().length === 0)) {
    return NextResponse.json({ error: 'title must be a non-empty string' }, { status: 400 });
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'no valid fields to update' }, { status: 400 });
  }

  // A title PATCH only ever comes from the card's rename pencil — flag it so the UI can
  // give a manually-chosen name more visual weight than the source's original title.
  if ('title' in update) update.title_edited = true;

  update.updated_at = new Date().toISOString();

  const supabase = getServiceClient();
  const { data, error } = await supabase.from('listings').update(update).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ listing: data });
}
