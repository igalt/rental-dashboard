import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../../lib/supabase/server', () => ({ getServiceClient: vi.fn() }));

import { getServiceClient } from '../../../../lib/supabase/server';
import { createFakeSupabase } from '../../../../lib/supabase/testUtils';
import { PATCH } from './route';
import { NextRequest } from 'next/server';

describe('PATCH /api/listings/[id]', () => {
  it('updates favorited/irrelevant/notes', async () => {
    const fake = createFakeSupabase({ listings: { data: { id: 'l1', favorited: true }, error: null } });
    vi.mocked(getServiceClient).mockReturnValue(fake as any);

    const request = new NextRequest('http://localhost/api/listings/l1', {
      method: 'PATCH',
      body: JSON.stringify({ favorited: true, notes: 'called them' }),
    });
    const response = await PATCH(request, { params: Promise.resolve({ id: 'l1' }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.listing.favorited).toBe(true);
    expect(fake.builders.listings.update).toHaveBeenCalledWith(
      expect.objectContaining({ favorited: true, notes: 'called them' })
    );
    expect(fake.builders.listings.eq).toHaveBeenCalledWith('id', 'l1');
  });

  it('rejects a non-object JSON body', async () => {
    const fake = createFakeSupabase({ listings: { data: null, error: null } });
    vi.mocked(getServiceClient).mockReturnValue(fake as any);

    const request = new NextRequest('http://localhost/api/listings/l1', {
      method: 'PATCH',
      body: JSON.stringify('hello'),
    });
    const response = await PATCH(request, { params: Promise.resolve({ id: 'l1' }) });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBeTruthy();
  });

  it('rejects an empty body with no recognized fields and skips the DB write', async () => {
    const fake = createFakeSupabase({ listings: { data: null, error: null } });
    vi.mocked(getServiceClient).mockReturnValue(fake as any);

    const request = new NextRequest('http://localhost/api/listings/l1', {
      method: 'PATCH',
      body: JSON.stringify({}),
    });
    const response = await PATCH(request, { params: Promise.resolve({ id: 'l1' }) });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBeTruthy();
    expect(fake.from).not.toHaveBeenCalled();
  });

  it('rejects unparseable JSON body', async () => {
    const fake = createFakeSupabase({ listings: { data: null, error: null } });
    vi.mocked(getServiceClient).mockReturnValue(fake as any);

    const request = new NextRequest('http://localhost/api/listings/l1', {
      method: 'PATCH',
      body: '{not valid json',
    });
    const response = await PATCH(request, { params: Promise.resolve({ id: 'l1' }) });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBeTruthy();
  });

  it('updates status', async () => {
    const fake = createFakeSupabase({ listings: { data: { id: 'l1', status: 'contacted' }, error: null } });
    vi.mocked(getServiceClient).mockReturnValue(fake as any);

    const request = new NextRequest('http://localhost/api/listings/l1', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'contacted' }),
    });
    const response = await PATCH(request, { params: Promise.resolve({ id: 'l1' }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.listing.status).toBe('contacted');
    expect(fake.builders.listings.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'contacted' })
    );
  });

  it('updates title and flags it as manually edited', async () => {
    const fake = createFakeSupabase({ listings: { data: { id: 'l1', title: 'Renamed listing' }, error: null } });
    vi.mocked(getServiceClient).mockReturnValue(fake as any);

    const request = new NextRequest('http://localhost/api/listings/l1', {
      method: 'PATCH',
      body: JSON.stringify({ title: 'Renamed listing' }),
    });
    const response = await PATCH(request, { params: Promise.resolve({ id: 'l1' }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.listing.title).toBe('Renamed listing');
    expect(fake.builders.listings.update).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Renamed listing', title_edited: true })
    );
  });

  it('rejects an empty title', async () => {
    const fake = createFakeSupabase({ listings: { data: null, error: null } });
    vi.mocked(getServiceClient).mockReturnValue(fake as any);

    const request = new NextRequest('http://localhost/api/listings/l1', {
      method: 'PATCH',
      body: JSON.stringify({ title: '   ' }),
    });
    const response = await PATCH(request, { params: Promise.resolve({ id: 'l1' }) });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBeTruthy();
  });

  it('rejects an invalid status value', async () => {
    const fake = createFakeSupabase({ listings: { data: null, error: null } });
    vi.mocked(getServiceClient).mockReturnValue(fake as any);

    const request = new NextRequest('http://localhost/api/listings/l1', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'archived' }),
    });
    const response = await PATCH(request, { params: Promise.resolve({ id: 'l1' }) });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBeTruthy();
  });

  it('rejects a wrong-typed favorited field', async () => {
    const fake = createFakeSupabase({ listings: { data: null, error: null } });
    vi.mocked(getServiceClient).mockReturnValue(fake as any);

    const request = new NextRequest('http://localhost/api/listings/l1', {
      method: 'PATCH',
      body: JSON.stringify({ favorited: 'yes' }),
    });
    const response = await PATCH(request, { params: Promise.resolve({ id: 'l1' }) });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBeTruthy();
  });
});
