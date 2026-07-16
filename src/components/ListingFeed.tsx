'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import type { Listing } from '../types/listing';
import { ListingCard } from './ListingCard';
import { ListingRow } from './ListingRow';
import { groupDuplicates } from '../lib/listings/groupDuplicates';

export function ListingFeed() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [showDelisted, setShowDelisted] = useState(false);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

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

  const visibleListings = useMemo(
    () => (favoritesOnly ? listings.filter((l) => l.favorited) : listings),
    [listings, favoritesOnly]
  );
  const groups = useMemo(() => groupDuplicates(visibleListings), [visibleListings]);
  const selected = listings.find((l) => l.id === selectedId) ?? null;

  return (
    <div>
      <div className="flex items-center justify-between mb-5 pb-3 border-b border-rule">
        <h2 className="font-display text-2xl text-ink">
          Listings
          {!loading && <span className="font-mono text-sm text-ink-soft ml-2">({visibleListings.length})</span>}
        </h2>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-xs font-mono uppercase tracking-wide text-ink-soft cursor-pointer">
            <input
              type="checkbox"
              checked={favoritesOnly}
              onChange={(e) => setFavoritesOnly(e.target.checked)}
              className="accent-rust"
            />
            Show favorites only
          </label>
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
      </div>
      {loading && <p className="text-sm text-ink-soft italic">Loading…</p>}
      {!loading && listings.length === 0 && (
        <p className="text-sm text-ink-soft italic border border-dashed border-rule rounded-sm p-6 text-center">
          No listings yet — paste one in with Quick add, or run an on-demand check.
        </p>
      )}
      {!loading && listings.length > 0 && visibleListings.length === 0 && (
        <p className="text-sm text-ink-soft italic border border-dashed border-rule rounded-sm p-6 text-center">
          No favorites yet — star a listing to see it here.
        </p>
      )}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
        <div className="space-y-3">
          {groups.map((group) =>
            group.length > 1 ? (
              <div
                key={group[0].id}
                className="rounded-sm border-2 border-dashed border-ochre/50 bg-ochre/5 p-2 space-y-2"
              >
                <p className="font-mono text-[10px] tracking-[0.15em] uppercase text-ochre px-1">
                  Possible duplicates ({group.length})
                </p>
                {group.map((listing) => (
                  <ListingRow key={listing.id} listing={listing} selected={listing.id === selectedId} onSelect={setSelectedId} />
                ))}
              </div>
            ) : (
              <ListingRow key={group[0].id} listing={group[0]} selected={group[0].id === selectedId} onSelect={setSelectedId} />
            )
          )}
        </div>

        {selected && (
          <div className="xl:sticky xl:top-10">
            <div className="flex justify-end mb-2">
              <button
                onClick={() => setSelectedId(null)}
                className="font-mono text-xs uppercase tracking-wide text-ink-soft hover:text-rust-dark"
              >
                ✕ close
              </button>
            </div>
            <ListingCard listing={selected} onUpdate={handleUpdate} onDuplicateAction={handleDuplicateAction} />
          </div>
        )}
      </div>
    </div>
  );
}
