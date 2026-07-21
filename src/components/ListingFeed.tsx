'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import type { Listing, ListingStatus, Source } from '../types/listing';
import { ListingCard } from './ListingCard';
import { ListingRow } from './ListingRow';

const SOURCES: Source[] = ['yad2', 'facebook', 'whatsapp', 'manual'];
const STATUSES: ListingStatus[] = ['new', 'contacted', 'seen'];

// Matches the `xl:` breakpoint the layout grid below switches on — desktop keeps
// the side-by-side sticky panel, everything narrower gets an inline-expanding row.
const DESKTOP_QUERY = '(min-width: 1280px)';

function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_QUERY);
    setIsDesktop(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return isDesktop;
}

export function ListingFeed() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [showDelisted, setShowDelisted] = useState(false);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<Source | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<ListingStatus | 'all'>('all');
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const isDesktop = useIsDesktop();

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

  const visibleListings = useMemo(
    () =>
      listings.filter(
        (l) =>
          (!favoritesOnly || l.favorited) &&
          (sourceFilter === 'all' || l.source === sourceFilter) &&
          (statusFilter === 'all' || l.status === statusFilter)
      ),
    [listings, favoritesOnly, sourceFilter, statusFilter]
  );
  const selected = listings.find((l) => l.id === selectedId) ?? null;

  function handleSelect(id: string) {
    setSelectedId((prev) => (prev === id ? null : id));
  }

  const detailRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (selectedId) detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [selectedId, isDesktop]);

  function CloseButton() {
    return (
      <div className="flex justify-end mb-2">
        <button
          onClick={() => setSelectedId(null)}
          className="font-mono text-xs uppercase tracking-wide text-ink-soft hover:text-rust-dark"
        >
          ✕ close
        </button>
      </div>
    );
  }

  function renderInlineCard(listing: Listing) {
    if (isDesktop || listing.id !== selectedId) return null;
    return (
      <div ref={detailRef} className="mt-2">
        <CloseButton />
        <ListingCard listing={listing} onUpdate={handleUpdate} />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5 pb-3 border-b border-rule">
        <h2 className="font-display text-2xl text-ink">
          Listings
          {!loading && <span className="font-mono text-sm text-ink-soft ml-2">({visibleListings.length})</span>}
        </h2>
        <div className="flex items-center gap-4">
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value as Source | 'all')}
            className="border border-rule rounded-sm px-2 py-1 text-xs font-mono uppercase bg-paper"
          >
            <option value="all">All sources</option>
            {SOURCES.map((source) => (
              <option key={source} value={source}>
                {source}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as ListingStatus | 'all')}
            className="border border-rule rounded-sm px-2 py-1 text-xs font-mono uppercase bg-paper"
          >
            <option value="all">All statuses</option>
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
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
          {favoritesOnly && sourceFilter === 'all' && statusFilter === 'all'
            ? 'No favorites yet — star a listing to see it here.'
            : 'No listings match these filters.'}
        </p>
      )}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
        <div className="space-y-3">
          {visibleListings.map((listing) => (
            <div key={listing.id}>
              <ListingRow listing={listing} selected={listing.id === selectedId} onSelect={handleSelect} />
              {renderInlineCard(listing)}
            </div>
          ))}
        </div>

        {isDesktop && selected && (
          <div className="xl:sticky xl:top-10">
            <CloseButton />
            <ListingCard listing={selected} onUpdate={handleUpdate} />
          </div>
        )}
      </div>
    </div>
  );
}
