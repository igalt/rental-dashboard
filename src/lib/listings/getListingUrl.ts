import type { Listing } from '../../types/listing';

export function getListingUrl(listing: Listing): string | null {
  if (!listing.source_ref) return null;
  if (/^https?:\/\//.test(listing.source_ref)) return listing.source_ref;
  if (listing.source === 'yad2') return `https://www.yad2.co.il${listing.source_ref}`;
  return null;
}
