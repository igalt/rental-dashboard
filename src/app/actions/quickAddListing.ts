'use server';

import { getServiceClient } from '../../lib/supabase/server';
import { extractListing } from '../../lib/extraction/extractListing';
import { findPossibleDuplicate } from '../../lib/dedup/findPossibleDuplicate';

export async function quickAddListing(rawText: string) {
  const supabase = getServiceClient();
  const extracted = await extractListing(rawText);
  const duplicateId = await findPossibleDuplicate(supabase, {
    price: extracted.price,
    rooms: extracted.rooms,
    area: extracted.area,
  });

  const { data, error } = await supabase
    .from('listings')
    .insert({
      source: 'manual',
      title: extracted.title,
      price: extracted.price,
      rooms: extracted.rooms,
      area: extracted.area,
      move_in_date: extracted.move_in_date,
      raw_text: rawText,
      possible_duplicate_of: duplicateId,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return { listing: data };
}
