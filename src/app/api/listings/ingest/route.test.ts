import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../lib/supabase/server', () => ({ getServiceClient: vi.fn() }));
vi.mock('../../../../lib/extraction/extractListing', () => ({ extractListing: vi.fn() }));

import { getServiceClient } from '../../../../lib/supabase/server';
import { extractListing } from '../../../../lib/extraction/extractListing';
import { createFakeSupabase } from '../../../../lib/supabase/testUtils';
import { POST } from './route';
import { NextRequest } from 'next/server';

beforeEach(() => {
  process.env.INGEST_API_KEY = 'test-key';
  vi.mocked(extractListing).mockResolvedValue({
    title: 'Nice place', price: 5000, rooms: 3, area: 'Florentin', move_in_date: '2026-09-01', listing_type: 'rental', safe_room: null,
  });
});

function makeRequest(body: unknown, authorized = true) {
  return new NextRequest('http://localhost/api/listings/ingest', {
    method: 'POST',
    headers: authorized ? { authorization: 'Bearer test-key' } : {},
    body: JSON.stringify(body),
  });
}

function makeRawRequest(rawBody: string, headers: Record<string, string> = { authorization: 'Bearer test-key' }) {
  return new NextRequest('http://localhost/api/listings/ingest', {
    method: 'POST',
    headers,
    body: rawBody,
  });
}

describe('POST /api/listings/ingest', () => {
  it('rejects unauthorized requests', async () => {
    const response = await POST(makeRequest({ source: 'manual', raw_text: 'x' }, false));
    expect(response.status).toBe(401);
  });

  it('extracts and inserts a listing', async () => {
    const fake = createFakeSupabase({
      listings: { data: { id: 'new-id' }, error: null },
    });
    vi.mocked(getServiceClient).mockReturnValue(fake as any);

    const response = await POST(makeRequest({ source: 'whatsapp', raw_text: 'raw text here' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.inserted).toHaveLength(1);
    expect(fake.builders.listings.insert).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'whatsapp', title: 'Nice place', price: 5000, listing_type: 'rental' })
    );
  });

  it('persists source_group and locate_hint for group-based sources', async () => {
    const fake = createFakeSupabase({
      listings: { data: { id: 'new-id' }, error: null },
    });
    vi.mocked(getServiceClient).mockReturnValue(fake as any);

    await POST(
      makeRequest({
        source: 'whatsapp',
        raw_text: 'raw text here',
        source_group: 'דירות וסאבלטים פר"ח כרכור',
        locate_hint: 'דרוש שותף לדירה גדולה',
      })
    );

    expect(fake.builders.listings.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        source_group: 'דירות וסאבלטים פר"ח כרכור',
        locate_hint: 'דרוש שותף לדירה גדולה',
      })
    );
  });

  it('persists a sublet classification from extraction', async () => {
    const fake = createFakeSupabase({
      listings: { data: { id: 'new-id' }, error: null },
    });
    vi.mocked(getServiceClient).mockReturnValue(fake as any);
    vi.mocked(extractListing).mockResolvedValue({
      title: 'August sublet', price: 3500, rooms: 2, area: 'Pardes Hana', move_in_date: '2026-08-03', listing_type: 'sublet', safe_room: null,
    });

    await POST(makeRequest({ source: 'whatsapp', raw_text: 'sublet text here' }));

    expect(fake.builders.listings.insert).toHaveBeenCalledWith(
      expect.objectContaining({ listing_type: 'sublet' })
    );
  });

  it('rejects with 401 when INGEST_API_KEY is unset, even with literal "Bearer undefined"', async () => {
    delete process.env.INGEST_API_KEY;

    const response = await POST(
      makeRawRequest(JSON.stringify({ source: 'manual', raw_text: 'x' }), {
        authorization: 'Bearer undefined',
      })
    );

    expect(response.status).toBe(401);
  });

  it('returns 400 for a malformed JSON body', async () => {
    const response = await POST(makeRawRequest('{not valid json'));
    expect(response.status).toBe(400);
  });

  it('returns 400 when source is not one of the allowed values', async () => {
    const response = await POST(makeRequest({ source: 'instagram', raw_text: 'some text' }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/source/i);
  });

  it('returns 400 when raw_text is missing or empty', async () => {
    const response = await POST(makeRequest({ source: 'manual', raw_text: '' }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/raw_text/i);
  });

  it('returns 400 when the batch array exceeds 50 items', async () => {
    const payloads = Array.from({ length: 51 }, () => ({ source: 'manual', raw_text: 'x' }));
    const response = await POST(makeRequest(payloads));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/50/);
  });
});
