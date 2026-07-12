import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/supabase/server', () => ({ getServiceClient: vi.fn() }));

import { getServiceClient } from '../../../lib/supabase/server';
import { createFakeSupabase } from '../../../lib/supabase/testUtils';
import { GET, POST, DELETE } from './route';
import { NextRequest } from 'next/server';

describe('/api/filter-rules', () => {
  it('GET lists all rules', async () => {
    const fake = createFakeSupabase({ filter_rules: { data: [{ id: 'r1' }], error: null } });
    vi.mocked(getServiceClient).mockReturnValue(fake as any);

    const response = await GET();
    const body = await response.json();
    expect(body.rules).toEqual([{ id: 'r1' }]);
  });

  it('POST inserts a rule', async () => {
    const fake = createFakeSupabase({ filter_rules: { data: { id: 'r2' }, error: null } });
    vi.mocked(getServiceClient).mockReturnValue(fake as any);

    const request = new NextRequest('http://localhost/api/filter-rules', {
      method: 'POST',
      body: JSON.stringify({ field: 'price', operator: 'lt', value: '6000', rule_group: 0 }),
    });
    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(fake.builders.filter_rules.insert).toHaveBeenCalled();
  });

  it('DELETE removes a rule by id', async () => {
    const fake = createFakeSupabase({ filter_rules: { data: null, error: null } });
    vi.mocked(getServiceClient).mockReturnValue(fake as any);

    const request = new NextRequest('http://localhost/api/filter-rules?id=r1', { method: 'DELETE' });
    const response = await DELETE(request);
    expect(response.status).toBe(200);
    expect(fake.builders.filter_rules.eq).toHaveBeenCalledWith('id', 'r1');
  });
});
