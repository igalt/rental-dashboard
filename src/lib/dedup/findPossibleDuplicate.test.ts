import { describe, it, expect } from 'vitest';
import { createFakeSupabase } from '../supabase/testUtils';
import { findPossibleDuplicate } from './findPossibleDuplicate';

describe('findPossibleDuplicate', () => {
  it('returns the matching listing id when price/rooms/area are close', async () => {
    const fake = createFakeSupabase({
      listings: { data: [{ id: 'existing-1' }], error: null },
    });

    const result = await findPossibleDuplicate(fake as any, {
      price: 5800,
      rooms: 3,
      area: 'Florentin',
    });

    expect(result).toBe('existing-1');
  });

  it('returns null when required fields are missing', async () => {
    const fake = createFakeSupabase({ listings: { data: [], error: null } });
    const result = await findPossibleDuplicate(fake as any, { price: null, rooms: 3, area: 'Florentin' });
    expect(result).toBeNull();
  });

  it('returns null when nothing matches', async () => {
    const fake = createFakeSupabase({ listings: { data: [], error: null } });
    const result = await findPossibleDuplicate(fake as any, { price: 5800, rooms: 3, area: 'Florentin' });
    expect(result).toBeNull();
  });
});
