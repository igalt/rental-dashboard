import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '../../../lib/supabase/server';
import { buildFilterString } from '../../../lib/rules/buildFilterString';
import type { FilterRule } from '../../../types/listing';

// Intentionally no auth check here: the dashboard is a login-free, two-person
// household tool reachable via a plain URL (explicit design decision). This
// route is only ever called by the dashboard's own UI, same as the other
// internal CRUD routes (filter-rules, tags, duplicate merge).

export async function GET(request: NextRequest) {
  const showDelisted = request.nextUrl.searchParams.get('show_delisted') === 'true';
  const supabase = getServiceClient();

  const { data: rules, error: rulesError } = await supabase.from('filter_rules').select('*');
  if (rulesError) return NextResponse.json({ error: rulesError.message }, { status: 500 });

  // No .limit() here deliberately: this is the primary feed a human reviews to see
  // "all my listings," so a silent cap would misleadingly suggest completeness when
  // rows were actually truncated. Acceptable at this app's expected scale (a two-person
  // household search, low hundreds of listings over the tool's lifetime). Revisit if
  // that assumption stops holding — pair any future cap with a `truncated` flag in the
  // response so the UI can surface it, rather than capping silently.
  let query = supabase.from('listings').select('*').order('extracted_at', { ascending: false });

  if (!showDelisted) {
    query = query.eq('irrelevant', false).is('delisted_at', null);
  }

  const filterString = buildFilterString((rules as FilterRule[]) ?? []);
  if (filterString) {
    query = query.or(filterString);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ listings: data });
}
