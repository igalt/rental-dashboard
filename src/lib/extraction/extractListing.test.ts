import { describe, it, expect } from 'vitest';
import { extractListing } from './extractListing';

describe('extractListing', () => {
  it('parses a JSON response from the LLM caller', async () => {
    const fakeCaller = async () =>
      JSON.stringify({
        title: '3-room apartment in Florentin',
        price: 5800,
        rooms: 3,
        area: 'Florentin, Tel Aviv',
        move_in_date: '2026-09-01',
      });

    const result = await extractListing('some raw whatsapp text', fakeCaller);

    expect(result).toEqual({
      title: '3-room apartment in Florentin',
      price: 5800,
      rooms: 3,
      area: 'Florentin, Tel Aviv',
      move_in_date: '2026-09-01',
    });
  });

  it('returns nulls when the caller returns unparseable text', async () => {
    const fakeCaller = async () => 'sorry, I cannot help with that';
    const result = await extractListing('garbage', fakeCaller);
    expect(result).toEqual({ title: null, price: null, rooms: null, area: null, move_in_date: null });
  });
});
