import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../../lib/supabase/server', () => ({ getServiceClient: vi.fn() }));

import { getServiceClient } from '../../../../lib/supabase/server';
import { createFakeSupabase } from '../../../../lib/supabase/testUtils';
import { PATCH } from './route';
import { NextRequest } from 'next/server';

describe('PATCH /api/listings/[id]', () => {
  it('updates favorited/irrelevant/notes', async () => {
    const fake = createFakeSupabase({ listings: { data: { id: 'l1', favorited: true }, error: null } });
    vi.mocked(getServiceClient).mockReturnValue(fake as any);

    const request = new NextRequest('http://localhost/api/listings/l1', {
      method: 'PATCH',
      body: JSON.stringify({ favorited: true, notes: 'called them' }),
    });
    const response = await PATCH(request, { params: Promise.resolve({ id: 'l1' }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.listing.favorited).toBe(true);
    expect(fake.builders.listings.update).toHaveBeenCalledWith(
      expect.objectContaining({ favorited: true, notes: 'called them' })
    );
    expect(fake.builders.listings.eq).toHaveBeenCalledWith('id', 'l1');
  });
});
