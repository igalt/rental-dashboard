'use client';

import { useEffect, useState } from 'react';
import type { Tag } from '../types/listing';

export function TagManager() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const response = await fetch('/api/tags');
    const body = await response.json();
    setTags(body.tags ?? []);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function addTag() {
    if (!label.trim()) return;
    setError(null);
    const response = await fetch('/api/tags', { method: 'POST', body: JSON.stringify({ label }) });
    if (!response.ok) {
      const body = await response.json();
      setError(body.error ?? 'failed to add tag');
      return;
    }
    setLabel('');
    refresh();
  }

  async function removeTag(id: string) {
    await fetch(`/api/tags?id=${id}`, { method: 'DELETE' });
    refresh();
  }

  return (
    <div className="bg-paper-raised border border-rule rounded-sm p-5 shadow-[3px_3px_0_0_var(--rule)]">
      <h2 className="font-mono text-xs tracking-[0.15em] uppercase text-ink-soft mb-3">Tags</h2>
      <div className="flex gap-1.5 flex-wrap mb-3">
        {tags.map((tag) => (
          <span key={tag.id} className="border border-sage/40 bg-sage/10 text-sage rounded-full px-2.5 py-0.5 text-xs font-mono flex items-center gap-1.5">
            {tag.label} <button className="text-sage/60 hover:text-rust-dark" onClick={() => removeTag(tag.id)}>×</button>
          </span>
        ))}
        {tags.length === 0 && <span className="text-sm text-ink-soft italic">No tags yet.</span>}
      </div>
      <div className="flex gap-1.5 pt-3 border-t border-rule">
        <input className="border border-rule rounded-sm px-2 py-1 text-xs font-mono flex-1 bg-paper" value={label} onChange={(e) => setLabel(e.target.value)} placeholder='e.g. "pet friendly"' />
        <button className="px-3 py-1 rounded-sm bg-rust text-paper-raised text-xs font-mono uppercase tracking-wide hover:bg-rust-dark transition-colors" onClick={addTag}>Add</button>
      </div>
      {error && <p className="text-xs text-rust-dark mt-2">{error}</p>}
    </div>
  );
}
