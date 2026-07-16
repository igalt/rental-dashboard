'use client';

import type { Listing } from '../types/listing';

interface Props {
  listing: Listing;
  selected: boolean;
  onSelect: (id: string) => void;
}

const SOURCE_ACCENT: Record<Listing['source'], string> = {
  yad2: 'var(--rust)',
  facebook: 'var(--indigo)',
  whatsapp: 'var(--sage)',
  manual: 'var(--ochre)',
};

export function ListingRow({ listing, selected, onSelect }: Props) {
  const accent = SOURCE_ACCENT[listing.source];

  return (
    <button
      onClick={() => onSelect(listing.id)}
      className={`w-full text-left flex items-center gap-3 p-3 rounded-sm border transition-colors border-l-4 ${
        selected ? 'bg-ink text-paper border-ink' : 'bg-paper-raised border-rule hover:border-ink'
      } ${listing.irrelevant ? 'opacity-50' : ''}`}
      style={{ borderLeftColor: accent }}
    >
      {listing.image_url ? (
        <img src={listing.image_url} alt="" className="w-12 h-12 object-cover rounded-sm border border-rule shrink-0" />
      ) : (
        <div className="w-12 h-12 rounded-sm border border-rule shrink-0 bg-paper" />
      )}
      <div className="min-w-0 flex-1">
        <p dir="auto" className={`font-display text-base leading-snug truncate ${selected ? 'text-paper' : 'text-ink'}`}>
          {listing.title ?? 'Untitled listing'}
        </p>
        <p dir="auto" className={`font-mono text-[11px] mt-0.5 flex flex-wrap gap-x-1.5 ${selected ? 'text-paper/70' : 'text-ink-soft'}`}>
          <span>₪{listing.price ?? '—'}</span>
          <span>·</span>
          <span>{listing.rooms ?? '—'} rm</span>
          <span>·</span>
          <span className="truncate">{listing.area ?? 'unknown'}</span>
        </p>
      </div>
      {listing.possible_duplicate_of && (
        <span className="text-[10px] font-mono uppercase text-ochre shrink-0">dup?</span>
      )}
    </button>
  );
}
