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
});
