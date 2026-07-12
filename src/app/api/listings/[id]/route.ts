import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '../../../../lib/supabase/server';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const body = await request.json();

  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: 'invalid request body' }, { status: 400 });
  }

  const allowedFields = ['favorited', 'irrelevant', 'notes'] as const;
  const update: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (field in body) update[field] = body[field];
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

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'no valid fields to update' }, { status: 400 });
  }

  update.updated_at = new Date().toISOString();

  const supabase = getServiceClient();
  const { data, error } = await supabase.from('listings').update(update).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ listing: data });
}
