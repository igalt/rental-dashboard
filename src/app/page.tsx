'use client';

import { useState } from 'react';
import { ListingFeed } from '../components/ListingFeed';
import { FilterRuleBuilder } from '../components/FilterRuleBuilder';
import { TagManager } from '../components/TagManager';
import { QuickAddBox } from '../components/QuickAddBox';

export default function Home() {
  const [feedKey, setFeedKey] = useState(0);

  return (
    <main className="max-w-6xl mx-auto px-6 py-10 md:py-14">
      <header className="mb-10 border-b border-rule pb-6">
        <p className="font-mono text-xs tracking-[0.2em] uppercase text-ink-soft mb-2">
          Two-person operation · no login required
        </p>
        <h1 className="font-display text-4xl md:text-5xl font-medium tracking-tight text-ink">
          The Listing Desk
        </h1>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-8 items-start">
        <aside className="space-y-6 lg:sticky lg:top-10">
          <FilterRuleBuilder />
          <TagManager />
          <QuickAddBox onAdded={() => setFeedKey((k) => k + 1)} />
        </aside>
        <ListingFeed key={feedKey} />
      </div>
    </main>
  );
}
