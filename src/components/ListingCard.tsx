'use client';

import { useState } from 'react';
import type { Listing } from '../types/listing';

interface Props {
  listing: Listing;
  onUpdate: (id: string, patch: Partial<Pick<Listing, 'favorited' | 'irrelevant' | 'notes'>>) => void;
  onDuplicateAction: (id: string, action: 'merge' | 'dismiss') => void;
}

export function ListingCard({ listing, onUpdate, onDuplicateAction }: Props) {
  const [notes, setNotes] = useState(listing.notes ?? '');

  return (
    <div className="border rounded-lg p-4 space-y-3 bg-white dark:bg-neutral-900 shadow-sm">
      <div className="flex justify-between items-start gap-2">
        <div>
          <h3 className="font-semibold text-lg">{listing.title ?? 'Untitled listing'}</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {listing.source} · {listing.price ?? '?'} · {listing.rooms ?? '?'} rooms · {listing.area ?? 'unknown area'}
          </p>
        </div>
        {listing.delisted_at && (
          <span className="text-xs bg-gray-200 dark:bg-gray-700 rounded-full px-2 py-1 whitespace-nowrap">Delisted</span>
        )}
      </div>

      {listing.possible_duplicate_of && (
        <div className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-300 dark:border-yellow-800 rounded-md p-2 text-sm flex justify-between items-center gap-2">
          <span>Possible duplicate — confirm?</span>
          <div className="flex gap-2 shrink-0">
            <button
              className="px-2 py-1 rounded bg-yellow-600 text-white text-xs hover:bg-yellow-700"
              onClick={() => onDuplicateAction(listing.id, 'merge')}
            >
              Merge
            </button>
            <button
              className="px-2 py-1 rounded border text-xs hover:bg-gray-50 dark:hover:bg-gray-800"
              onClick={() => onDuplicateAction(listing.id, 'dismiss')}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <button
          className={`px-3 py-1 rounded border text-sm ${listing.favorited ? 'bg-pink-100 dark:bg-pink-950 border-pink-300 font-medium' : 'hover:bg-gray-50 dark:hover:bg-gray-800'}`}
          onClick={() => onUpdate(listing.id, { favorited: !listing.favorited })}
        >
          {listing.favorited ? '★ Favorited' : '☆ Favorite'}
        </button>
        <button
          className={`px-3 py-1 rounded border text-sm ${listing.irrelevant ? 'bg-gray-200 dark:bg-gray-700 font-medium' : 'hover:bg-gray-50 dark:hover:bg-gray-800'}`}
          onClick={() => onUpdate(listing.id, { irrelevant: !listing.irrelevant })}
        >
          {listing.irrelevant ? 'Marked irrelevant' : 'Mark irrelevant'}
        </button>
      </div>

      <textarea
        className="w-full border rounded-md p-2 text-sm bg-transparent"
        rows={2}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={() => onUpdate(listing.id, { notes })}
        placeholder="Shared notes..."
      />
    </div>
  );
}
