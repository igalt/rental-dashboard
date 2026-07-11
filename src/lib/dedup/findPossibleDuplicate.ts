import type { SupabaseClient } from '@supabase/supabase-js';

export interface ListingCandidate {
  price: number | null;
  rooms: number | null;
  area: string | null;
}

const PRICE_TOLERANCE = 0.1; // 10%

export async function findPossibleDuplicate(
  supabase: SupabaseClient,
  candidate: ListingCandidate,
  excludeId?: string
): Promise<string | null> {
  if (candidate.price == null || candidate.rooms == null || !candidate.area) {
    return null;
  }

  const priceMin = candidate.price * (1 - PRICE_TOLERANCE);
  const priceMax = candidate.price * (1 + PRICE_TOLERANCE);

  let query = supabase
    .from('listings')
    .select('id')
    .eq('rooms', candidate.rooms)
    .ilike('area', candidate.area)
    .gte('price', priceMin)
    .lte('price', priceMax)
    .limit(1);

  if (excludeId) {
    query = query.neq('id', excludeId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data as { id: string }[] | null)?.[0]?.id ?? null;
}
