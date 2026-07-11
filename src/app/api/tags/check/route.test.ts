import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../lib/supabase/server', () => ({ getServiceClient: vi.fn() }));
vi.mock('../../../../lib/tags/matchTag', () => ({ matchTag: vi.fn() }));

import { getServiceClient } from '../../../../lib/supabase/server';
import { matchTag } from '../../../../lib/tags/matchTag';
import { createFakeSupabase } from '../../../../lib/supabase/testUtils';
import { POST } from './route';
import { NextRequest } from 'next/server';

beforeEach(() => {
  process.env.INGEST_API_KEY = 'test-key';
  vi.mocked(matchTag).mockResolvedValue('matched');
});

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost/api/tags/check', {
    method: 'POST',
    headers: { authorization: 'Bearer test-key' },
    body: JSON.stringify(body),
  });
}

/**
 * The shared `createFakeSupabase` fake resolves the same canned result on every
 * call for a given table, so it can't simulate "the 1st upsert fails, the 2nd
 * succeeds." This builder tracks call count and returns an error on the given
 * (zero-based) call index only, letting us assert the sweep keeps going past a
 * single bad row instead of aborting.
 */
function createFailingUpsertBuilder(errorOnCallIndex: number) {
  const builder: Record<string, unknown> = {};
  const chainMethods = ['select', 'insert', 'update', 'delete', 'eq', 'neq', 'ilike', 'gte', 'lte', 'limit', 'single', 'maybeSingle', 'or', 'order', 'is'];
  for (const method of chainMethods) {
    builder[method] = vi.fn(() => builder);
  }
  let callIndex = 0;
  builder.upsert = vi.fn(() => {
    const isFailure = callIndex === errorOnCallIndex;
    callIndex++;
    const result = isFailure ? { data: null, error: { message: 'upsert failed' } } : { data: null, error: null };
    return { then: (resolve: (r: typeof result) => unknown) => resolve(result) };
  });
  return builder;
}

describe('POST /api/tags/check', () => {
  it('checks one listing against all tags (Supabase webhook shape)', async () => {
    const fake = createFakeSupabase({
      listings: { data: { id: 'l1', raw_text: 'pet friendly place' }, error: null },
      tags: { data: [{ id: 't1', label: 'pet friendly' }], error: null },
      listing_tags: { data: null, error: null },
    });
    vi.mocked(getServiceClient).mockReturnValue(fake as any);

    const response = await POST(makeRequest({ type: 'INSERT', table: 'listings', record: { id: 'l1' } }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.checked).toBe(1);
    expect(fake.builders.listing_tags.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ listing_id: 'l1', tag_id: 't1', match_status: 'matched' })
    );
  });

  it('checks one tag against all listings (new-tag sweep shape)', async () => {
    const fake = createFakeSupabase({
      tags: { data: { id: 't1', label: 'pet friendly' }, error: null },
      listings: { data: [{ id: 'l1', raw_text: 'text 1' }, { id: 'l2', raw_text: 'text 2' }], error: null },
      listing_tags: { data: null, error: null },
    });
    vi.mocked(getServiceClient).mockReturnValue(fake as any);

    const response = await POST(makeRequest({ tag_id: 't1' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.checked).toBe(2);
  });

  it('tracks upsert failures without aborting the rest of the sweep', async () => {
    const fake = createFakeSupabase({
      listings: { data: { id: 'l1', raw_text: 'pet friendly place' }, error: null },
      tags: {
        data: [
          { id: 't1', label: 'pet friendly' },
          { id: 't2', label: 'quiet' },
        ],
        error: null,
      },
    });
    fake.builders.listing_tags = createFailingUpsertBuilder(0);
    vi.mocked(getServiceClient).mockReturnValue(fake as any);

    const response = await POST(makeRequest({ type: 'INSERT', table: 'listings', record: { id: 'l1' } }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.checked).toBe(2);
    expect(body.failed).toBe(1);
    expect(fake.builders.listing_tags.upsert).toHaveBeenCalledTimes(2);
  });

  it('returns a non-200 status when every upsert in the sweep fails', async () => {
    const fake = createFakeSupabase({
      tags: { data: { id: 't1', label: 'pet friendly' }, error: null },
      listings: { data: [{ id: 'l1', raw_text: 'text 1' }], error: null },
    });
    fake.builders.listing_tags = createFailingUpsertBuilder(0);
    vi.mocked(getServiceClient).mockReturnValue(fake as any);

    const response = await POST(makeRequest({ tag_id: 't1' }));
    const body = await response.json();

    expect(response.status).not.toBe(200);
    expect(body.checked).toBe(1);
    expect(body.failed).toBe(1);
  });

  it('ignores webhook-shaped payloads that are not a listings INSERT', async () => {
    const fake = createFakeSupabase({
      listings: { data: { id: 'l1', raw_text: 'pet friendly place' }, error: null },
      tags: { data: [{ id: 't1', label: 'pet friendly' }], error: null },
      listing_tags: { data: null, error: null },
    });
    vi.mocked(getServiceClient).mockReturnValue(fake as any);

    const response = await POST(makeRequest({ type: 'UPDATE', table: 'tags', record: { id: 'l1' } }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/listing_id or tag_id required/i);
  });

  it('caps the tags query at 500 rows in the webhook branch', async () => {
    const fake = createFakeSupabase({
      listings: { data: { id: 'l1', raw_text: 'pet friendly place' }, error: null },
      tags: { data: [{ id: 't1', label: 'pet friendly' }], error: null },
      listing_tags: { data: null, error: null },
    });
    vi.mocked(getServiceClient).mockReturnValue(fake as any);

    await POST(makeRequest({ type: 'INSERT', table: 'listings', record: { id: 'l1' } }));

    expect(fake.builders.tags.limit).toHaveBeenCalledWith(500);
  });

  it('caps the listings query at 500 rows in the tag-sweep branch', async () => {
    const fake = createFakeSupabase({
      tags: { data: { id: 't1', label: 'pet friendly' }, error: null },
      listings: { data: [{ id: 'l1', raw_text: 'text 1' }], error: null },
      listing_tags: { data: null, error: null },
    });
    vi.mocked(getServiceClient).mockReturnValue(fake as any);

    await POST(makeRequest({ tag_id: 't1' }));

    expect(fake.builders.listings.limit).toHaveBeenCalledWith(500);
  });
});
