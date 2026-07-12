import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../../../lib/supabase/server', () => ({ getServiceClient: vi.fn() }));

import { getServiceClient } from '../../../../../lib/supabase/server';
import { POST } from './route';
import { NextRequest } from 'next/server';

function makeRequest(action: string) {
  return new NextRequest('http://localhost/api/listings/l1/duplicate', {
    method: 'POST',
    body: JSON.stringify({ action }),
  });
}

// Tracks which id was last queried and returns matching canned data for that id;
// records every update() call so tests can assert on which id got which patch.
function makeListingsFake(recordsById: Record<string, unknown>) {
  const updateCalls: { id: string; patch: Record<string, unknown> }[] = [];
  let queriedId: string | undefined;

  const builder: any = {
    select: vi.fn(() => builder),
    eq: vi.fn((col: string, val: string) => {
      if (col === 'id') queriedId = val;
      return builder;
    }),
    update: vi.fn((patch: Record<string, unknown>) => {
      updateCalls.push({ id: queriedId!, patch });
      return builder;
    }),
    single: vi.fn(() => Promise.resolve({ data: recordsById[queriedId!], error: null })),
    then: (resolve: (r: { data: unknown; error: null }) => unknown) =>
      resolve({ data: recordsById[queriedId!], error: null }),
  };

  return { from: vi.fn(() => builder), updateCalls };
}

describe('POST /api/listings/[id]/duplicate', () => {
  it('dismiss clears the possible_duplicate_of flag', async () => {
    const fake = makeListingsFake({ l1: { id: 'l1' } });
    vi.mocked(getServiceClient).mockReturnValue(fake as any);

    const response = await POST(makeRequest('dismiss'), { params: Promise.resolve({ id: 'l1' }) });
    expect(response.status).toBe(200);
    expect(fake.updateCalls[0]).toEqual({ id: 'l1', patch: { possible_duplicate_of: null } });
  });

  it('merge marks the OLDER record irrelevant even when the newer one was clicked', async () => {
    const fake = makeListingsFake({
      l1: { id: 'l1', possible_duplicate_of: 'l2', updated_at: '2026-07-10T00:00:00Z' }, // requested, newer
      l2: { id: 'l2', updated_at: '2026-07-01T00:00:00Z' }, // older
    });
    vi.mocked(getServiceClient).mockReturnValue(fake as any);

    const response = await POST(makeRequest('merge'), { params: Promise.resolve({ id: 'l1' }) });
    expect(response.status).toBe(200);

    const irrelevantUpdate = fake.updateCalls.find((c) => c.patch.irrelevant === true);
    expect(irrelevantUpdate?.id).toBe('l2');
  });

  it('merge marks the requested record irrelevant when IT is the older one', async () => {
    const fake = makeListingsFake({
      l1: { id: 'l1', possible_duplicate_of: 'l2', updated_at: '2026-07-01T00:00:00Z' }, // requested, older
      l2: { id: 'l2', updated_at: '2026-07-10T00:00:00Z' }, // newer
    });
    vi.mocked(getServiceClient).mockReturnValue(fake as any);

    const response = await POST(makeRequest('merge'), { params: Promise.resolve({ id: 'l1' }) });
    expect(response.status).toBe(200);

    const irrelevantUpdate = fake.updateCalls.find((c) => c.patch.irrelevant === true);
    expect(irrelevantUpdate?.id).toBe('l1');
  });
});
