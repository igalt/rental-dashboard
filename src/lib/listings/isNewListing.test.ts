import { describe, it, expect } from 'vitest';
import { isNewListing } from './isNewListing';

describe('isNewListing', () => {
  const now = new Date('2026-07-20T12:00:00Z');

  it('is true for a listing extracted moments ago', () => {
    expect(isNewListing('2026-07-20T11:00:00Z', now)).toBe(true);
  });

  it('is true right up to just under 3 days old', () => {
    expect(isNewListing('2026-07-17T12:00:01Z', now)).toBe(true);
  });

  it('is false once a listing turns 3 days old', () => {
    expect(isNewListing('2026-07-17T12:00:00Z', now)).toBe(false);
  });

  it('is false for a listing much older than 3 days', () => {
    expect(isNewListing('2026-06-01T12:00:00Z', now)).toBe(false);
  });
});
