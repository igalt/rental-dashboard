import { describe, it, expect } from 'vitest';
import { matchTag } from './matchTag';

describe('matchTag', () => {
  it('returns matched', async () => {
    const result = await matchTag('raw text', 'pet friendly', async () => 'matched');
    expect(result).toBe('matched');
  });

  it('returns unmatched (and does not get confused by "matched" being a substring of "unmatched")', async () => {
    const result = await matchTag('raw text', 'pet friendly', async () => 'unmatched');
    expect(result).toBe('unmatched');
  });

  it('returns unclear for anything else', async () => {
    const result = await matchTag('raw text', 'pet friendly', async () => 'not sure honestly');
    expect(result).toBe('unclear');
  });

  it('does not misclassify "not matched" as matched', async () => {
    const result = await matchTag('raw text', 'pet friendly', async () => "I'd say it's not matched");
    expect(result).toBe('unmatched');
  });
});
