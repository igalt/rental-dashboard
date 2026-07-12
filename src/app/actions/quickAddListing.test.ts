import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/supabase/server', () => ({ getServiceClient: vi.fn() }));
vi.mock('../../lib/extraction/extractListing', () => ({ extractListing: vi.fn() }));
vi.mock('../../lib/dedup/findPossibleDuplicate', () => ({ findPossibleDuplicate: vi.fn() }));

import { getServiceClient } from '../../lib/supabase/server';
import { extractListing } from '../../lib/extraction/extractListing';
import { findPossibleDuplicate } from '../../lib/dedup/findPossibleDuplicate';
import { createFakeSupabase } from '../../lib/supabase/testUtils';
import { quickAddListing } from './quickAddListing';

beforeEach(() => {
  vi.mocked(extractListing).mockResolvedValue({
    title: 'Paste-added listing', price: 4500, rooms: 2, area: 'Center', move_in_date: null,
  });
  vi.mocked(findPossibleDuplicate).mockResolvedValue(null);
});

describe('quickAddListing', () => {
  it('extracts, dedups, and inserts a manual listing directly (no HTTP round-trip)', async () => {
    const fake = createFakeSupabase({ listings: { data: { id: 'new-id' }, error: null } });
    vi.mocked(getServiceClient).mockReturnValue(fake as any);

    const result = await quickAddListing('some pasted facebook post text');

    expect(result.listing).toEqual({ id: 'new-id' });
    expect(fake.builders.listings.insert).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'manual', title: 'Paste-added listing' })
    );
  });
});
