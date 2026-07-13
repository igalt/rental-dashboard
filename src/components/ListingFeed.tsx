'use client';

import { useEffect, useState, useCallback } from 'react';
import type { Listing } from '../types/listing';
import { ListingCard } from './ListingCard';

export function ListingFeed() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [showDelisted, setShowDelisted] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/listings${showDelisted ? '?show_delisted=true' : ''}`);
    const body = await response.json();
    setListings(body.listings ?? []);
    setLoading(false);
  }, [showDelisted]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleUpdate(id: string, patch: Partial<Listing>) {
    await fetch(`/api/listings/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
    refresh();
  }

  async function handleDuplicateAction(id: string, action: 'merge' | 'dismiss') {
    await fetch(`/api/listings/${id}/duplicate`, { method: 'POST', body: JSON.stringify({ action }) });
    refresh();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5 pb-3 border-b border-rule">
        <h2 className="font-display text-2xl text-ink">
          Listings
          {!loading && <span className="font-mono text-sm text-ink-soft ml-2">({listings.length})</span>}
        </h2>
        <label className="flex items-center gap-2 text-xs font-mono uppercase tracking-wide text-ink-soft cursor-pointer">
          <input
            type="checkbox"
            checked={showDelisted}
            onChange={(e) => setShowDelisted(e.target.checked)}
            className="accent-rust"
          />
          Show delisted too
        </label>
      </div>
      {loading && <p className="text-sm text-ink-soft italic">Loading…</p>}
      {!loading && listings.length === 0 && (
        <p className="text-sm text-ink-soft italic border border-dashed border-rule rounded-sm p-6 text-center">
          No listings yet — paste one in with Quick add, or run an on-demand check.
        </p>
      )}
      <div className="space-y-4">
        {listings.map((listing) => (
          <ListingCard key={listing.id} listing={listing} onUpdate={handleUpdate} onDuplicateAction={handleDuplicateAction} />
        ))}
      </div>
    </div>
  );
}
