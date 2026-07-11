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

    // Verify the query was actually built with the right filters, not just
    // that the fake happened to return canned data regardless of args.
    expect(fake.builders.listings.eq).toHaveBeenCalledWith('rooms', 3);
    expect(fake.builders.listings.ilike).toHaveBeenCalledWith('area', 'Florentin');
    expect(fake.builders.listings.gte).toHaveBeenCalledWith('price', 5220);

    // 5800 * 1.1 is 6380.000000000001 in floating point, so assert the call
    // args directly and use toBeCloseTo for the numeric comparison instead
    // of toHaveBeenCalledWith with an exact float literal.
    const lteCall = (fake.builders.listings.lte as any).mock.calls[0];
    expect(lteCall[0]).toBe('price');
    expect(lteCall[1]).toBeCloseTo(6380);
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

  it('excludes the given id from the query when excludeId is passed, and skips the filter otherwise', async () => {
    const fakeWithExclude = createFakeSupabase({
      listings: { data: [{ id: 'existing-1' }], error: null },
    });

    await findPossibleDuplicate(
      fakeWithExclude as any,
      { price: 5800, rooms: 3, area: 'Florentin' },
      'self-id'
    );

    expect(fakeWithExclude.builders.listings.neq).toHaveBeenCalledWith('id', 'self-id');

    const fakeWithoutExclude = createFakeSupabase({
      listings: { data: [{ id: 'existing-1' }], error: null },
    });

    await findPossibleDuplicate(fakeWithoutExclude as any, { price: 5800, rooms: 3, area: 'Florentin' });

    expect(fakeWithoutExclude.builders.listings.neq).not.toHaveBeenCalled();
  });
});
