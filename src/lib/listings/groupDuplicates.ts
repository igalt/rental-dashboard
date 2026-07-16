import type { Listing } from '../../types/listing';

/**
 * Clusters listings that are linked via possible_duplicate_of (in either direction)
 * so duplicate candidates can render adjacent to each other, while preserving the
 * original relative order otherwise (first-seen position of any cluster member wins).
 */
export function groupDuplicates(listings: Listing[]): Listing[][] {
  const byId = new Map(listings.map((l) => [l.id, l]));
  const clusterOf = new Map<string, string>(); // listing id -> cluster root id

  function find(id: string): string {
    let root = id;
    while (clusterOf.has(root) && clusterOf.get(root) !== root) root = clusterOf.get(root)!;
    return root;
  }

  function union(a: string, b: string) {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) clusterOf.set(rootB, rootA);
  }

  for (const listing of listings) {
    if (!clusterOf.has(listing.id)) clusterOf.set(listing.id, listing.id);
  }
  for (const listing of listings) {
    if (listing.possible_duplicate_of && byId.has(listing.possible_duplicate_of)) {
      union(listing.id, listing.possible_duplicate_of);
    }
  }

  const clusters = new Map<string, Listing[]>();
  for (const listing of listings) {
    const root = find(listing.id);
    if (!clusters.has(root)) clusters.set(root, []);
    clusters.get(root)!.push(listing);
  }

  // Preserve original order: emit clusters in the order their first member first appears.
  const seenRoots = new Set<string>();
  const ordered: Listing[][] = [];
  for (const listing of listings) {
    const root = find(listing.id);
    if (seenRoots.has(root)) continue;
    seenRoots.add(root);
    ordered.push(clusters.get(root)!);
  }
  return ordered;
}
