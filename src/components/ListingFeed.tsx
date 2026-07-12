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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-xl">Listings</h2>
        <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <input type="checkbox" checked={showDelisted} onChange={(e) => setShowDelisted(e.target.checked)} />
          Show delisted too
        </label>
      </div>
      {loading && <p className="text-sm text-gray-500">Loading…</p>}
      {!loading && listings.length === 0 && <p className="text-sm text-gray-500">No listings yet.</p>}
      <div className="space-y-3">
        {listings.map((listing) => (
          <ListingCard key={listing.id} listing={listing} onUpdate={handleUpdate} onDuplicateAction={handleDuplicateAction} />
        ))}
      </div>
    </div>
  );
}
