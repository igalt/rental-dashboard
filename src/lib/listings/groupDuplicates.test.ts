import { describe, it, expect } from 'vitest';
import { groupDuplicates } from './groupDuplicates';
import type { Listing } from '../../types/listing';

function makeListing(overrides: Partial<Listing> & { id: string }): Listing {
  return {
    source: 'yad2',
    source_ref: null,
    title: null,
    price: null,
    rooms: null,
    area: null,
    listing_type: 'rental',
    move_in_date: null,
    move_in_immediate: null,
    raw_text: null,
    image_url: null,
    safe_room: null,
    floor: null,
    built_sqm: null,
    condition: null,
    balcony: null,
    storage: null,
    furnished: null,
    status: 'new',
    extracted_at: '2026-01-01T00:00:00Z',
    favorited: false,
    irrelevant: false,
    notes: null,
    possible_duplicate_of: null,
    delisted_at: null,
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('groupDuplicates', () => {
  it('keeps unrelated listings as singleton groups in original order', () => {
    const listings = [makeListing({ id: 'a' }), makeListing({ id: 'b' }), makeListing({ id: 'c' })];
    const groups = groupDuplicates(listings);
    expect(groups).toEqual([[listings[0]], [listings[1]], [listings[2]]]);
  });

  it('groups a listing with its duplicate target adjacently', () => {
    const a = makeListing({ id: 'a' });
    const b = makeListing({ id: 'b', possible_duplicate_of: 'a' });
    const c = makeListing({ id: 'c' });
    const groups = groupDuplicates([a, c, b]);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toEqual(expect.arrayContaining([a, b]));
    expect(groups[1]).toEqual([c]);
  });

  it('merges a chain of three listings into one cluster', () => {
    const a = makeListing({ id: 'a' });
    const b = makeListing({ id: 'b', possible_duplicate_of: 'a' });
    const c = makeListing({ id: 'c', possible_duplicate_of: 'b' });
    const groups = groupDuplicates([a, b, c]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toEqual(expect.arrayContaining([a, b, c]));
  });

  it('ignores a dangling possible_duplicate_of pointing at a listing not in the list', () => {
    const a = makeListing({ id: 'a', possible_duplicate_of: 'missing' });
    const groups = groupDuplicates([a]);
    expect(groups).toEqual([[a]]);
  });
});
