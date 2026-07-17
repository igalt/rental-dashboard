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
        listing_type: 'rental',
      });

    const result = await extractListing('some raw whatsapp text', fakeCaller);

    expect(result).toEqual({
      title: '3-room apartment in Florentin',
      price: 5800,
      rooms: 3,
      area: 'Florentin, Tel Aviv',
      move_in_date: '2026-09-01',
      listing_type: 'rental',
    });
  });

  it('preserves a sublet classification from the LLM caller', async () => {
    const fakeCaller = async () =>
      JSON.stringify({
        title: 'Short-term garden apartment, August only',
        price: 3500,
        rooms: 2,
        area: 'Pardes Hana',
        move_in_date: '2026-08-03',
        listing_type: 'sublet',
      });

    const result = await extractListing('some raw whatsapp text', fakeCaller);
    expect(result.listing_type).toBe('sublet');
  });

  it('defaults listing_type to rental when the caller omits it or returns something else', async () => {
    const fakeCaller = async () => JSON.stringify({ title: 'Apartment', listing_type: 'short-term' });
    const result = await extractListing('some raw whatsapp text', fakeCaller);
    expect(result.listing_type).toBe('rental');
  });

  it('returns nulls when the caller returns unparseable text', async () => {
    const fakeCaller = async () => 'sorry, I cannot help with that';
    const result = await extractListing('garbage', fakeCaller);
    expect(result).toEqual({
      title: null,
      price: null,
      rooms: null,
      area: null,
      move_in_date: null,
      listing_type: 'rental',
    });
  });

  it('extracts JSON that is fenced and surrounded by prose containing extra braces', async () => {
    const fakeCaller = async () =>
      [
        'Here is the extracted listing:',
        '',
        '```json',
        JSON.stringify({
          title: 'Cozy studio',
          price: 4200,
          rooms: 1,
          area: 'Florentin',
          move_in_date: '2026-08-01',
        }),
        '```',
        '',
        'Let me know if you need the info in a different format {like CSV}.',
      ].join('\n');

    const result = await extractListing('some raw whatsapp text', fakeCaller);

    expect(result).toEqual({
      title: 'Cozy studio',
      price: 4200,
      rooms: 1,
      area: 'Florentin',
      move_in_date: '2026-08-01',
      listing_type: 'rental',
    });
  });

  it('returns nulls when the response contains a brace block that is not valid JSON', async () => {
    const fakeCaller = async () => '{"title": "Nice place", "price": 5000,}';
    const result = await extractListing('garbage', fakeCaller);
    expect(result).toEqual({
      title: null,
      price: null,
      rooms: null,
      area: null,
      move_in_date: null,
      listing_type: 'rental',
    });
  });
});
