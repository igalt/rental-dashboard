import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../lib/supabase/server', () => ({ getServiceClient: vi.fn() }));
vi.mock('../../../lib/rules/buildFilterString', () => ({ buildFilterString: vi.fn() }));

import { getServiceClient } from '../../../lib/supabase/server';
import { buildFilterString } from '../../../lib/rules/buildFilterString';
import { createFakeSupabase } from '../../../lib/supabase/testUtils';
import { GET } from './route';
import { NextRequest } from 'next/server';

describe('GET /api/listings', () => {
  it('excludes delisted listings by default and applies stored rules', async () => {
    vi.mocked(buildFilterString).mockReturnValue('or(price.lt.6000)');
    const fake = createFakeSupabase({
      filter_rules: { data: [{ id: 'r1', field: 'price', operator: 'lt', value: '6000', rule_group: 0 }], error: null },
      listings: { data: [{ id: 'l1' }], error: null },
    });
    vi.mocked(getServiceClient).mockReturnValue(fake as any);

    const request = new NextRequest('http://localhost/api/listings');
    const response = await GET(request);
    const body = await response.json();

    expect(body.listings).toEqual([{ id: 'l1' }]);
    expect(fake.builders.listings.eq).toHaveBeenCalledWith('irrelevant', false);
    expect(fake.builders.listings.or).toHaveBeenCalledWith('or(price.lt.6000)');
  });

  it('includes delisted listings when show_delisted=true is passed', async () => {
    vi.mocked(buildFilterString).mockReturnValue(null);
    const fake = createFakeSupabase({
      filter_rules: { data: [], error: null },
      listings: { data: [], error: null },
    });
    vi.mocked(getServiceClient).mockReturnValue(fake as any);

    const request = new NextRequest('http://localhost/api/listings?show_delisted=true');
    await GET(request);
    expect(fake.builders.listings.or).not.toHaveBeenCalled();
  });
});
