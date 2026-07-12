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
    <div className="space-y-2 border rounded-lg p-4 bg-white dark:bg-neutral-900">
      <h2 className="font-semibold">Tags</h2>
      <div className="flex gap-2 flex-wrap">
        {tags.map((tag) => (
          <span key={tag.id} className="border rounded-full px-3 py-1 text-sm flex items-center gap-1">
            {tag.label} <button className="text-gray-400 hover:text-red-600" onClick={() => removeTag(tag.id)}>×</button>
          </span>
        ))}
        {tags.length === 0 && <span className="text-sm text-gray-500">No tags yet.</span>}
      </div>
      <div className="flex gap-2 pt-1">
        <input className="border rounded px-2 py-1 text-sm flex-1 bg-transparent" value={label} onChange={(e) => setLabel(e.target.value)} placeholder='e.g. "pet friendly"' />
        <button className="px-3 py-1 rounded bg-blue-600 text-white text-sm hover:bg-blue-700" onClick={addTag}>Add tag</button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
