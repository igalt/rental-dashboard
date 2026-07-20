'use server';

import { getServiceClient } from '../../lib/supabase/server';
import { extractListing } from '../../lib/extraction/extractListing';

type QuickAddResult =
  | { ok: true; listing: unknown }
  | { ok: false; error: string };

export async function quickAddListing(rawText: string): Promise<QuickAddResult> {
  if (typeof rawText !== 'string' || rawText.trim().length === 0) {
    return { ok: false, error: 'raw_text must be a non-empty string' };
  }

  try {
    const supabase = getServiceClient();
    const extracted = await extractListing(rawText);

    const { data, error } = await supabase
      .from('listings')
      .insert({
        source: 'manual',
        title: extracted.title,
        price: extracted.price,
        rooms: extracted.rooms,
        area: extracted.area,
        move_in_date: extracted.move_in_date,
        listing_type: extracted.listing_type,
        raw_text: rawText,
      })
      .select()
      .single();

    if (error) {
      console.error('Failed to insert quick-add listing:', error);
      return { ok: false, error: 'failed to save listing' };
    }

    return { ok: true, listing: data };
  } catch (err) {
    console.error('Quick-add failed:', err);
    return { ok: false, error: 'failed to add listing' };
  }
}
