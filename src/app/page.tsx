'use client';

import { useState } from 'react';
import { ListingFeed } from '../components/ListingFeed';
import { FilterRuleBuilder } from '../components/FilterRuleBuilder';
import { TagManager } from '../components/TagManager';
import { QuickAddBox } from '../components/QuickAddBox';

export default function Home() {
  const [feedKey, setFeedKey] = useState(0);

  return (
    <main className="max-w-3xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">Rental Dashboard</h1>
      <FilterRuleBuilder />
      <TagManager />
      <QuickAddBox onAdded={() => setFeedKey((k) => k + 1)} />
      <ListingFeed key={feedKey} />
    </main>
  );
}
