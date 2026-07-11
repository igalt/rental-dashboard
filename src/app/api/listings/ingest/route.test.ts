import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../lib/supabase/server', () => ({ getServiceClient: vi.fn() }));
vi.mock('../../../../lib/extraction/extractListing', () => ({ extractListing: vi.fn() }));
vi.mock('../../../../lib/dedup/findPossibleDuplicate', () => ({ findPossibleDuplicate: vi.fn() }));

import { getServiceClient } from '../../../../lib/supabase/server';
import { extractListing } from '../../../../lib/extraction/extractListing';
import { findPossibleDuplicate } from '../../../../lib/dedup/findPossibleDuplicate';
import { createFakeSupabase } from '../../../../lib/supabase/testUtils';
import { POST } from './route';
import { NextRequest } from 'next/server';

beforeEach(() => {
  process.env.INGEST_API_KEY = 'test-key';
  vi.mocked(extractListing).mockResolvedValue({
    title: 'Nice place', price: 5000, rooms: 3, area: 'Florentin', move_in_date: '2026-09-01',
  });
  vi.mocked(findPossibleDuplicate).mockResolvedValue(null);
});

function makeRequest(body: unknown, authorized = true) {
  return new NextRequest('http://localhost/api/listings/ingest', {
    method: 'POST',
    headers: authorized ? { authorization: 'Bearer test-key' } : {},
    body: JSON.stringify(body),
  });
}

describe('POST /api/listings/ingest', () => {
  it('rejects unauthorized requests', async () => {
    const response = await POST(makeRequest({ source: 'manual', raw_text: 'x' }, false));
    expect(response.status).toBe(401);
  });

  it('extracts, dedups, and inserts a listing', async () => {
    const fake = createFakeSupabase({
      listings: { data: { id: 'new-id' }, error: null },
    });
    vi.mocked(getServiceClient).mockReturnValue(fake as any);

    const response = await POST(makeRequest({ source: 'whatsapp', raw_text: 'raw text here' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.inserted).toHaveLength(1);
    expect(fake.builders.listings.insert).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'whatsapp', title: 'Nice place', price: 5000 })
    );
  });
});
