import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { createClient } from '@supabase/supabase-js';
import { findPossibleDuplicate } from '../src/lib/dedup/findPossibleDuplicate';

puppeteer.use(StealthPlugin());

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const YAD2_SEARCH_URL = process.env.YAD2_SEARCH_URL!;
const DELISTING_DROP_THRESHOLD = 0.5; // skip the delisting pass if the result count drops by more than this fraction

interface ScrapedListing {
  source_ref: string;
  title: string;
  price: number | null;
  rooms: number | null;
  area: string | null;
}

async function scrapeYad2(): Promise<ScrapedListing[]> {
  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(YAD2_SEARCH_URL, { waitUntil: 'networkidle2' });

    // PLACEHOLDER SELECTORS — replace with real ones once the real Yad2 search URL
    // is available and the actual DOM structure has been inspected via devtools.
    const listings = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('[data-testid="feed-item"]'));
      return cards.map((card) => {
        const link = card.querySelector('a')?.getAttribute('href') ?? '';
        const idMatch = link.match(/item\/([a-zA-Z0-9]+)/);
        const priceText = card.querySelector('[data-testid="price"]')?.textContent ?? '';
        const roomsText = card.querySelector('[data-testid="rooms"]')?.textContent ?? '';
        const areaText = card.querySelector('[data-testid="area"]')?.textContent ?? '';
        const titleText = card.querySelector('[data-testid="title"]')?.textContent ?? '';
        return {
          source_ref: idMatch ? idMatch[1] : link,
          title: titleText.trim(),
          price: priceText ? Number(priceText.replace(/[^\d]/g, '')) : null,
          rooms: roomsText ? Number(roomsText.replace(/[^\d.]/g, '')) : null,
          area: areaText.trim() || null,
        };
      });
    });

    return listings.filter((l) => l.source_ref);
  } finally {
    await browser.close();
  }
}

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const scraped = await scrapeYad2();
  console.log(`Scraped ${scraped.length} listings from Yad2`);

  for (const listing of scraped) {
    // Look up whether this exact Yad2 listing already exists, so the dedup check below
    // excludes it from matching against itself (it will always have the same price/rooms/area).
    const { data: existing } = await supabase
      .from('listings')
      .select('id')
      .eq('source', 'yad2')
      .eq('source_ref', listing.source_ref)
      .maybeSingle();
    const existingId = (existing as { id: string } | null)?.id;

    const duplicateId = await findPossibleDuplicate(
      supabase,
      { price: listing.price, rooms: listing.rooms, area: listing.area },
      existingId
    );

    await supabase.from('listings').upsert(
      {
        source: 'yad2',
        source_ref: listing.source_ref,
        title: listing.title,
        price: listing.price,
        rooms: listing.rooms,
        area: listing.area,
        delisted_at: null,
        possible_duplicate_of: duplicateId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'source,source_ref' }
    );
  }

  const { data: existingYad2, error } = await supabase
    .from('listings')
    .select('id, source_ref, delisted_at')
    .eq('source', 'yad2');
  if (error) throw error;

  const rows = (existingYad2 as { id: string; source_ref: string; delisted_at: string | null }[]) ?? [];
  const priorActiveCount = rows.filter((l) => !l.delisted_at).length;
  const scrapedRefs = new Set(scraped.map((l) => l.source_ref));
  const stillPresentCount = rows.filter((l) => scrapedRefs.has(l.source_ref)).length;
  const dropRatio = priorActiveCount > 0 ? 1 - stillPresentCount / priorActiveCount : 0;

  if (scraped.length === 0 || dropRatio > DELISTING_DROP_THRESHOLD) {
    console.warn(
      `Skipping delisting pass: scraped ${scraped.length} listings, ${Math.round(dropRatio * 100)}% drop vs prior run — likely a scraper failure, not real delistings.`
    );
    return;
  }

  const toDelist = rows.filter((l) => !l.delisted_at && !scrapedRefs.has(l.source_ref));
  for (const listing of toDelist) {
    await supabase.from('listings').update({ delisted_at: new Date().toISOString() }).eq('id', listing.id);
  }
  console.log(`Marked ${toDelist.length} listings as delisted`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
