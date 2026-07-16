import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import type { Page } from 'puppeteer';
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
  image_url: string | null;
  safe_room: boolean | null;
}

interface ListingDetails {
  image_url: string | null;
  safe_room: boolean | null;
}

// The feed page doesn't expose photos or the safe-room (ממ"ד) amenity — both only show up
// on each listing's own detail page, so enrichment needs one extra visit per listing.
// safe_room: true if the site marks the amenity present, false if the site explicitly marks
// it absent (a real, disabled-styled entry still renders), null if the section isn't shown
// at all for that listing (unknown, not stated either way).
async function fetchListingDetails(page: Page, sourceRef: string): Promise<ListingDetails> {
  const response = await page.goto(`https://www.yad2.co.il${sourceRef}`, { waitUntil: 'networkidle2' });
  if (!response || response.status() === 404) return { image_url: null, safe_room: null };

  return page.evaluate(() => {
    const og = document.querySelector('meta[property="og:image"]');
    const img = document.querySelector('img[src*="img.yad2"]') || document.querySelector('main img');
    const raw = og?.getAttribute('content') ?? img?.getAttribute('src') ?? null;
    const image_url = raw && !raw.includes('placeholder') ? raw.split('?')[0] : null;

    const mamad = document.querySelector('[data-testid="security-room-item"]');
    const safe_room = mamad ? !mamad.className.includes('disabled') : null;

    return { image_url, safe_room };
  });
}

async function scrapeYad2(): Promise<ScrapedListing[]> {
  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(YAD2_SEARCH_URL, { waitUntil: 'networkidle2' });

    // Real selectors, confirmed via live devtools inspection against the user's actual
    // search URL (2026-07-13). Class names are CSS-module hashes that Yad2 can rotate on
    // deploy; matched via [class*="..."] on the stable prefix rather than an exact string
    // so a hash-suffix change alone doesn't silently break scraping.
    const listings = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('[class*="item-layout_feedItemBox"]'));
      return cards
        .map((card) => {
          // Promoted "project" ads render in the same feed but have no price span and no
          // /item/ detail link — skipping them here is what excludes ads from real listings.
          const priceEl = card.querySelector('[class*="feed-item-price_price"]');
          const link = card.querySelector('a[href*="/item/"]');
          if (!priceEl || !link) return null;

          const href = link.getAttribute('href') ?? '';
          const pathOnly = href.split('?')[0];

          const titleEl = card.querySelector('[class*="item-data-content_heading"]');
          const infoLines = Array.from(card.querySelectorAll('[class*="item-data-content_itemInfoLine"]'));
          // First info line: "{property type}, {neighborhood}, {city}" — area is everything
          // after the first comma. Second info line: "{rooms} חדרים • קומה {floor} • {sqm} מ״ר".
          const typeAreaText = infoLines[0]?.textContent ?? '';
          const roomsFloorSqmText = infoLines[1]?.textContent ?? '';
          const area = typeAreaText.split(',').slice(1).join(',').trim() || null;
          const roomsMatch = roomsFloorSqmText.match(/(\d+(?:\.\d+)?)\s*חדרים/);
          const priceText = priceEl.textContent ?? '';

          return {
            // Full path (not just a regex-extracted numeric id) — this listing type's URLs
            // are shaped /item/<region-slug>/<code>, not a plain numeric id, so the full
            // canonical path is the reliable unique identifier regardless of URL shape.
            source_ref: pathOnly,
            title: (titleEl?.textContent ?? '').trim(),
            price: priceText ? Number(priceText.replace(/[^\d]/g, '')) : null,
            rooms: roomsMatch ? Number(roomsMatch[1]) : null,
            area,
          };
        })
        .filter((l): l is NonNullable<typeof l> => l !== null);
    });

    const withRefs = listings.filter((l) => l.source_ref);

    // Enrich each listing from its own detail page — the feed doesn't expose photos or the
    // safe-room amenity at all, so this costs one extra page visit per listing.
    const enriched: ScrapedListing[] = [];
    for (const listing of withRefs) {
      const details = await fetchListingDetails(page, listing.source_ref);
      enriched.push({ ...listing, ...details });
    }
    return enriched;
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
        image_url: listing.image_url,
        safe_room: listing.safe_room,
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
