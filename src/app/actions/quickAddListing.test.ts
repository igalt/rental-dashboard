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
  vi.clearAllMocks();
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

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok result');
    expect(result.listing).toEqual({ id: 'new-id' });
    expect(fake.builders.listings.insert).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'manual', title: 'Paste-added listing' })
    );
  });

  it('rejects empty/whitespace raw_text without calling extraction or the db', async () => {
    const result = await quickAddListing('   ');

    expect(result).toEqual({ ok: false, error: 'raw_text must be a non-empty string' });
    expect(extractListing).not.toHaveBeenCalled();
    expect(getServiceClient).not.toHaveBeenCalled();
  });

  it('returns a generic error and logs the raw error when the insert fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const dbError = { message: 'column "price" is of type integer but expression is of type text' };
    const fake = createFakeSupabase({ listings: { data: null, error: dbError } });
    vi.mocked(getServiceClient).mockReturnValue(fake as any);

    const result = await quickAddListing('some pasted facebook post text');

    expect(result).toEqual({ ok: false, error: 'failed to save listing' });
    expect(consoleSpy).toHaveBeenCalledWith('Failed to insert quick-add listing:', dbError);

    consoleSpy.mockRestore();
  });
});
