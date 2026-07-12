import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '../../../../lib/supabase/server';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const body = await request.json();
  const allowedFields = ['favorited', 'irrelevant', 'notes'] as const;
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const field of allowedFields) {
    if (field in body) update[field] = body[field];
  }

  const supabase = getServiceClient();
  const { data, error } = await supabase.from('listings').update(update).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ listing: data });
}
