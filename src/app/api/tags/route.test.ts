import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/supabase/server', () => ({ getServiceClient: vi.fn() }));
global.fetch = vi.fn(async () => new Response(JSON.stringify({ checked: 0 }), { status: 200 })) as any;

import { getServiceClient } from '../../../lib/supabase/server';
import { createFakeSupabase } from '../../../lib/supabase/testUtils';
import { GET, POST, DELETE } from './route';
import { NextRequest } from 'next/server';

beforeEach(() => {
  process.env.INGEST_API_KEY = 'test-key';
});

describe('/api/tags', () => {
  it('GET lists all tags', async () => {
    const fake = createFakeSupabase({ tags: { data: [{ id: 't1', label: 'pet friendly' }], error: null } });
    vi.mocked(getServiceClient).mockReturnValue(fake as any);
    const response = await GET();
    const body = await response.json();
    expect(body.tags).toEqual([{ id: 't1', label: 'pet friendly' }]);
  });

  it('POST inserts a tag and triggers a sweep against existing listings', async () => {
    const fake = createFakeSupabase({ tags: { data: { id: 't2', label: 'quiet street' }, error: null } });
    vi.mocked(getServiceClient).mockReturnValue(fake as any);

    const request = new NextRequest('http://localhost/api/tags', {
      method: 'POST',
      body: JSON.stringify({ label: 'quiet street' }),
    });
    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/tags/check'),
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('DELETE removes a tag by id', async () => {
    const fake = createFakeSupabase({ tags: { data: null, error: null } });
    vi.mocked(getServiceClient).mockReturnValue(fake as any);
    const request = new NextRequest('http://localhost/api/tags?id=t1', { method: 'DELETE' });
    const response = await DELETE(request);
    expect(response.status).toBe(200);
  });
});
