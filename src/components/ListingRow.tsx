'use client';

import type { Listing } from '../types/listing';
import { isNewListing } from '../lib/listings/isNewListing';
import { getListingUrl } from '../lib/listings/getListingUrl';

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
  const url = getListingUrl(listing);

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
        <p
          dir="auto"
          className={`font-display text-base leading-snug truncate ${
            selected
              ? listing.title_edited ? 'text-paper font-semibold' : 'text-paper/80'
              : listing.title_edited ? 'text-rust-dark font-semibold' : 'text-indigo font-medium'
          }`}
        >
          {listing.title ?? 'Untitled listing'}
        </p>
        <p dir="auto" className={`font-display text-base font-medium leading-snug truncate ${selected ? 'text-paper' : 'text-ink'}`}>
          {listing.area ?? 'unknown area'}
        </p>
        <p dir="auto" className={`font-mono text-[11px] mt-0.5 ${selected ? 'text-paper/70' : 'text-ink-soft'}`}>
          ₪{listing.price ?? '—'} · {listing.rooms ?? '—'} rm
        </p>
      </div>
      <div className="flex flex-col items-end justify-between gap-1 shrink-0 self-stretch">
        <div className="flex flex-col items-end gap-1">
          {isNewListing(listing.extracted_at) && (
            <span className="text-[10px] font-mono uppercase tracking-wide bg-sage text-paper-raised rounded-full px-2 py-0.5">
              New
            </span>
          )}
          {listing.listing_type === 'sublet' && (
            <span className="text-[10px] font-mono uppercase tracking-wide bg-rust text-paper-raised rounded-full px-2 py-0.5">
              Sublet
            </span>
          )}
        </div>
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            aria-label="View original ad"
            title="View original ad"
            className={`font-mono text-sm font-medium ${selected ? 'text-paper/70 hover:text-paper' : 'text-rust hover:text-rust-dark'}`}
          >
            view ↗
          </a>
        ) : (
          (listing.source === 'whatsapp' || listing.source === 'facebook') && (
            <span
              className="text-[10px] font-mono uppercase tracking-wide text-paper-raised rounded-full px-2 py-0.5"
              style={{ backgroundColor: accent }}
            >
              {listing.source}
            </span>
          )
        )}
      </div>
    </button>
  );
}
