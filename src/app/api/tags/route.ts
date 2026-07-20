import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '../../../lib/supabase/server';

// Intentionally no auth check here: the dashboard is a login-free, two-person
// household tool reachable via a plain URL (explicit design decision). This
// route is only ever called by the dashboard's own UI, same as the other
// internal CRUD routes (filter-rules, listings feed/update).

export async function GET() {
  const supabase = getServiceClient();
  const { data, error } = await supabase.from('tags').select('*');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tags: data });
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'invalid request body' }, { status: 400 });
  }

  const { label } = body as Record<string, unknown>;
  if (typeof label !== 'string' || label.trim().length === 0) {
    return NextResponse.json({ error: 'label must be a non-empty string' }, { status: 400 });
  }
  const trimmedLabel = label.trim();

  const supabase = getServiceClient();
  const { data, error } = await supabase.from('tags').insert({ label: trimmedLabel }).select().single();
  if (error) {
    // Postgres unique_violation on tags.label — surface a clean, client-actionable
    // 409 instead of leaking the raw constraint name (e.g. "tags_label_key") at 500.
    if ((error as { code?: string }).code === '23505') {
      return NextResponse.json({ error: 'a tag with this label already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: (error as { message: string }).message }, { status: 500 });
  }

  const tag = data as { id: string };
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;
  try {
    const sweepResponse = await fetch(`${baseUrl}/api/tags/check`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${process.env.INGEST_API_KEY}`,
      },
      body: JSON.stringify({ tag_id: tag.id }),
    });
    // The sweep is fire-and-forget as far as this route's own response goes —
    // a failed sweep must never fail tag creation, since the tag row is already
    // committed. But a silent failure here means the tag exists yet is never
    // checked against any listing, with no record anywhere that this happened
    // (e.g. INGEST_API_KEY unset in this environment -> /api/tags/check
    // fails closed with 401). Log it so it's at least visible in server logs.
    if (!sweepResponse.ok) {
      console.error('Tag sweep failed after tag creation', {
        tag_id: tag.id,
        status: sweepResponse.status,
      });
    }
  } catch (err) {
    console.error('Tag sweep request threw after tag creation', {
      tag_id: tag.id,
      error: err,
    });
  }

  return NextResponse.json({ tag: data });
}

export async function DELETE(request: NextRequest) {
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const supabase = getServiceClient();
  const { error } = await supabase.from('tags').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
