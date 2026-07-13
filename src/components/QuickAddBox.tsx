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
    <div className="bg-paper-raised border border-rule rounded-sm p-5 shadow-[3px_3px_0_0_var(--rule)]">
      <h2 className="font-mono text-xs tracking-[0.15em] uppercase text-ink-soft mb-1">Quick add</h2>
      <p className="text-sm text-ink-soft mb-3">Paste a listing from Facebook, WhatsApp, or anywhere else.</p>
      <textarea
        className="w-full border border-rule rounded-sm p-2 text-sm bg-paper mb-3 focus:outline-none focus:ring-1 focus:ring-rust"
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste listing text here..."
      />
      <button
        className="px-3 py-1 rounded-sm bg-rust text-paper-raised text-xs font-mono uppercase tracking-wide hover:bg-rust-dark transition-colors disabled:opacity-40 disabled:hover:bg-rust"
        onClick={handleSubmit}
        disabled={isPending || !text.trim()}
      >
        {isPending ? 'Adding…' : 'Add listing'}
      </button>
      {error && <p className="text-xs text-rust-dark mt-2">{error}</p>}
    </div>
  );
}
