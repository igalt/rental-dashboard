import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '../../../lib/supabase/server';
import type { RuleField, RuleOperator } from '../../../types/listing';

// Intentionally no auth check here: the dashboard is a login-free, two-person
// household tool reachable via a plain URL (explicit design decision). This
// route is only ever called by the dashboard's own UI, same as the other
// internal CRUD routes (tags, listings feed/update).

const VALID_FIELDS: RuleField[] = [
  'price',
  'rooms',
  'area',
  'move_in_date',
  'listing_type',
  'status',
  'floor',
  'built_sqm',
  'condition',
  'safe_room',
  'balcony',
  'storage',
  'furnished',
];
const VALID_OPERATORS: RuleOperator[] = ['eq', 'lt', 'lte', 'gt', 'gte', 'in'];

export async function GET() {
  const supabase = getServiceClient();
  const { data, error } = await supabase.from('filter_rules').select('*');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rules: data });
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

  const { field, operator, value, rule_group } = body as Record<string, unknown>;

  if (typeof field !== 'string' || !VALID_FIELDS.includes(field as RuleField)) {
    return NextResponse.json({ error: `field must be one of: ${VALID_FIELDS.join(', ')}` }, { status: 400 });
  }
  if (typeof operator !== 'string' || !VALID_OPERATORS.includes(operator as RuleOperator)) {
    return NextResponse.json({ error: `operator must be one of: ${VALID_OPERATORS.join(', ')}` }, { status: 400 });
  }
  if (typeof value !== 'string' || value.length === 0) {
    return NextResponse.json({ error: 'value must be a non-empty string' }, { status: 400 });
  }
  // buildFilterString (Task 8) interpolates `value` raw into a PostgREST filter
  // string (e.g. `${field}.in.(${value})`). Parentheses let a value break out of
  // its intended grouping and splice extra clauses into the filter sent to
  // Supabase, so this route — the only gate before rows land in the table — must
  // reject them here.
  if (/[()]/.test(value)) {
    return NextResponse.json({ error: 'value must not contain parentheses' }, { status: 400 });
  }
  if (rule_group !== undefined && typeof rule_group !== 'number') {
    return NextResponse.json({ error: 'rule_group must be a number' }, { status: 400 });
  }

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from('filter_rules')
    .insert({ field, operator, value, rule_group: rule_group ?? 0 })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rule: data });
}

export async function DELETE(request: NextRequest) {
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const supabase = getServiceClient();
  const { error } = await supabase.from('filter_rules').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
