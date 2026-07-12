'use client';

import { useState, useTransition } from 'react';
import { quickAddListing } from '../app/actions/quickAddListing';

export function QuickAddBox({ onAdded }: { onAdded?: () => void }) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const result = await quickAddListing(text);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setText('');
      onAdded?.();
    });
  }

  return (
    <div className="space-y-2 border rounded-lg p-4 bg-white dark:bg-neutral-900">
      <h2 className="font-semibold">Quick add</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400">Paste a listing from Facebook, WhatsApp, or anywhere else.</p>
      <textarea
        className="w-full border rounded-md p-2 text-sm bg-transparent"
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste listing text here..."
      />
      <button
        className="px-3 py-1 rounded bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-50"
        onClick={handleSubmit}
        disabled={isPending || !text.trim()}
      >
        {isPending ? 'Adding...' : 'Add listing'}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
