'use client';

import { useEffect, useState } from 'react';
import type { Listing, ListingStatus } from '../types/listing';

interface Props {
  listing: Listing;
  onUpdate: (id: string, patch: Partial<Pick<Listing, 'favorited' | 'irrelevant' | 'notes' | 'status' | 'title'>>) => void;
  onDuplicateAction: (id: string, action: 'merge' | 'dismiss') => void;
}

const STATUSES: ListingStatus[] = ['new', 'contacted', 'seen'];

const SOURCE_ACCENT: Record<Listing['source'], string> = {
  yad2: 'var(--rust)',
  facebook: 'var(--indigo)',
  whatsapp: 'var(--sage)',
  manual: 'var(--ochre)',
};

function getListingUrl(listing: Listing): string | null {
  if (!listing.source_ref) return null;
  if (/^https?:\/\//.test(listing.source_ref)) return listing.source_ref;
  if (listing.source === 'yad2') return `https://www.yad2.co.il${listing.source_ref}`;
  return null;
}

function formatMoveInDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-');
  return `${day}/${month}/${year}`;
}

export function ListingCard({ listing, onUpdate, onDuplicateAction }: Props) {
  const [notes, setNotes] = useState(listing.notes ?? '');
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(listing.title ?? '');

  useEffect(() => {
    setNotes(listing.notes ?? '');
  }, [listing.notes]);

  useEffect(() => {
    setTitleDraft(listing.title ?? '');
  }, [listing.title]);

  function saveTitle() {
    setEditingTitle(false);
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== listing.title) onUpdate(listing.id, { title: trimmed });
    else setTitleDraft(listing.title ?? '');
  }

  const accent = SOURCE_ACCENT[listing.source];
  const url = getListingUrl(listing);

  const extraDetails = [
    listing.floor && `floor: ${listing.floor}`,
    listing.built_sqm && `${listing.built_sqm}m² built`,
    listing.condition,
    listing.balcony && 'balcony',
    listing.storage && 'storage',
    listing.furnished && 'furnished',
  ].filter(Boolean) as string[];

  return (
    <div
      className={`bg-paper-raised border border-rule rounded-sm p-5 space-y-3 border-l-4 transition-opacity ${listing.irrelevant ? 'opacity-50' : ''}`}
      style={{ borderLeftColor: accent }}
    >
      <div className="flex justify-between items-start gap-3">
        {listing.image_url && (
          <img
            src={listing.image_url}
            alt=""
            className="w-20 h-20 object-cover rounded-sm border border-rule shrink-0"
          />
        )}
        <div className="min-w-0 flex-1">
          <span className="font-mono text-[11px] tracking-[0.15em] uppercase" style={{ color: accent }}>
            {listing.source}
          </span>
          {editingTitle ? (
            <input
              dir="auto"
              autoFocus
              className="font-display text-xl leading-snug text-ink mt-0.5 w-full bg-paper border border-rust rounded-sm px-1 focus:outline-none"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
                if (e.key === 'Escape') {
                  setTitleDraft(listing.title ?? '');
                  setEditingTitle(false);
                }
              }}
            />
          ) : (
            <h3 dir="auto" className="font-display text-xl leading-snug text-ink mt-0.5 flex items-center gap-2 group">
              {url ? (
                <a href={url} target="_blank" rel="noopener noreferrer" className="hover:text-rust-dark underline decoration-rule underline-offset-4">
                  {listing.title ?? 'Untitled listing'}
                </a>
              ) : (
                <span>{listing.title ?? 'Untitled listing'}</span>
              )}
              <button
                onClick={() => setEditingTitle(true)}
                className="font-mono text-xs text-ink-soft/40 hover:text-rust-dark transition-colors shrink-0"
                aria-label="Edit listing name"
                title="Edit listing name"
              >
                ✎
              </button>
            </h3>
          )}
          <p dir="auto" className="font-mono text-xs text-ink-soft mt-1.5 flex flex-wrap gap-x-2">
            <span>₪{listing.price ?? '—'}</span>
            <span>·</span>
            <span>{listing.rooms ?? '—'} rooms</span>
            <span>·</span>
            <span>{listing.area ?? 'unknown area'}</span>
            {listing.safe_room !== null && (
              <>
                <span>·</span>
                <span>{listing.safe_room ? 'safe room' : 'no safe room'}</span>
              </>
            )}
            {listing.move_in_date && (
              <>
                <span>·</span>
                <span>entrance {formatMoveInDate(listing.move_in_date)}</span>
              </>
            )}
            {!listing.move_in_date && listing.move_in_immediate && (
              <>
                <span>·</span>
                <span>immediate entrance</span>
              </>
            )}
            {url && (
              <>
                <span>·</span>
                <a href={url} target="_blank" rel="noopener noreferrer" className="text-rust hover:text-rust-dark">
                  view original ↗
                </a>
              </>
            )}
          </p>
          {extraDetails.length > 0 && (
            <p dir="auto" className="font-mono text-xs text-ink-soft mt-1">
              {extraDetails.join(' · ')}
            </p>
          )}
        </div>
        {listing.delisted_at && (
          <span className="text-[10px] font-mono uppercase tracking-wide bg-ink text-paper rounded-full px-2 py-1 whitespace-nowrap shrink-0 -rotate-2">
            Delisted
          </span>
        )}
      </div>

      {listing.raw_text && (
        <details className="text-sm">
          <summary className="font-mono text-[11px] tracking-[0.15em] uppercase text-ink-soft cursor-pointer select-none">
            Description
          </summary>
          <p dir="auto" className="mt-2 text-ink whitespace-pre-wrap">{listing.raw_text}</p>
        </details>
      )}

      {listing.possible_duplicate_of && (
        <div className="bg-ochre/10 border border-ochre/40 rounded-sm p-2.5 text-sm flex justify-between items-center gap-2">
          <span className="text-ink">Possible duplicate — confirm?</span>
          <div className="flex gap-1.5 shrink-0">
            <button
              className="px-2 py-1 rounded-sm bg-ochre text-paper-raised text-xs font-mono uppercase hover:brightness-95 transition-all"
              onClick={() => onDuplicateAction(listing.id, 'merge')}
            >
              Merge
            </button>
            <button
              className="px-2 py-1 rounded-sm border border-ochre/50 text-xs font-mono uppercase text-ink hover:bg-ochre/10 transition-colors"
              onClick={() => onDuplicateAction(listing.id, 'dismiss')}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-1.5">
        {STATUSES.map((status) => (
          <button
            key={status}
            className={`px-3 py-1 rounded-sm border text-xs font-mono uppercase tracking-wide transition-colors ${
              listing.status === status
                ? 'bg-ink text-paper border-ink'
                : 'border-rule text-ink-soft hover:border-ink'
            }`}
            onClick={() => onUpdate(listing.id, { status })}
          >
            {status}
          </button>
        ))}
      </div>

      <div className="flex gap-1.5">
        <button
          className={`px-3 py-1 rounded-sm border text-xs font-mono uppercase tracking-wide transition-colors ${
            listing.favorited
              ? 'bg-rust text-paper-raised border-rust'
              : 'border-rule text-ink-soft hover:border-rust hover:text-rust-dark'
          }`}
          onClick={() => onUpdate(listing.id, { favorited: !listing.favorited })}
        >
          {listing.favorited ? '★ Favorited' : '☆ Favorite'}
        </button>
        <button
          className={`px-3 py-1 rounded-sm border text-xs font-mono uppercase tracking-wide transition-colors ${
            listing.irrelevant
              ? 'bg-ink text-paper border-ink'
              : 'border-rule text-ink-soft hover:border-ink'
          }`}
          onClick={() => onUpdate(listing.id, { irrelevant: !listing.irrelevant })}
        >
          {listing.irrelevant ? 'Marked irrelevant' : 'Mark irrelevant'}
        </button>
      </div>

      <textarea
        dir="auto"
        className="w-full border border-rule rounded-sm p-2 text-sm bg-paper focus:outline-none focus:ring-1 focus:ring-rust"
        rows={2}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={() => onUpdate(listing.id, { notes })}
        placeholder="Shared notes..."
      />
    </div>
  );
}
