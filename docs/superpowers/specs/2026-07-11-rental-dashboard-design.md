# Rental Dashboard — Design Spec

**Date:** 2026-07-11
**Status:** Approved for planning

## Problem

Igal and his wife are hunting for a rental home. Listings are scattered across three sources — Yad2, Facebook groups, and WhatsApp groups — with no way to see them together, filter by their actual criteria, or track what they've already looked at. They want a shared dashboard that pools listings from all three sources into one filtered, deduplicated feed.

## Scope

New standalone project (separate from the existing Beatfulness Playlist Helper repo, which is an unrelated Spotify tool). Two users (Igal + wife), no login required — dashboard is reachable via a plain URL.

## Architecture

- **App**: Next.js, hosted on Vercel (free tier).
- **Database**: Supabase Postgres (free tier). Single source of truth for all listings regardless of origin.
- **Yad2 ingestion**: automated, scheduled scraper (Puppeteer + puppeteer-extra-plugin-stealth, same approach proven in the MiloNesting project) running as a **GitHub Actions scheduled workflow** (cron). Free minutes cover this easily at low frequency (e.g. hourly). Yad2's listing pages already expose structured fields (price, rooms, area, etc.) in the HTML, so this path does **not** use LLM extraction — the workflow parses those fields directly and **upserts straight into Supabase** using a service-role key, keyed on `source_ref` (Yad2's listing ID) for dedup. This path does not go through the Ingest API described below.
- **WhatsApp ingestion**: **on-demand only**, never scheduled. Triggered by the user asking a Claude Code session to check WhatsApp groups. That session uses computer-use to open WhatsApp Desktop, read the group(s) the user names, extract listing-shaped messages via LLM parsing, and POST the resulting raw text to the app's Ingest API (below).
- **Facebook ingestion**: **on-demand only**, never scheduled. Triggered the same way — a Claude Code session uses browser automation (the user's own logged-in session) to browse the specified Facebook group(s) once, extract new posts, and POST the raw text to the Ingest API.

  Rationale for both being on-demand rather than scheduled: Facebook aggressively detects automated browsing patterns on an account and can trigger checkpoints/lockouts; WhatsApp Desktop UI automation is fragile and disruptive (takes over mouse/keyboard) if run unattended on a schedule. On-demand keeps both to low-frequency, human-initiated use that looks like normal activity and avoids fighting for control of the Mac.

- **Manual paste**: a "quick add" box in the dashboard UI. Works for any source — user pastes raw text (a Facebook post, a WhatsApp message, anything). This calls the same underlying extraction logic as the Ingest API, but in-process (same-origin server action, not an HTTP round-trip) since it's already running inside the dashboard's own backend.

## Data Model

Single `listings` table in Supabase, regardless of source:

| Field | Notes |
|---|---|
| `id` | primary key |
| `source` | `yad2` \| `facebook` \| `whatsapp` \| `manual` |
| `source_ref` | original URL or platform ID, used for exact-dedup within a source; null for manual pastes with no original link |
| `title` | |
| `price` | |
| `rooms` | |
| `area` | free-text neighborhood/city |
| `move_in_date` | |
| `raw_text` | original scraped/pasted text, kept for re-parsing or manual review |
| `extracted_at` | timestamp |
| `favorited` | boolean — global, not per-user (no login, so state is shared like `notes`) |
| `hidden` | boolean — global, same as `favorited` |
| `notes` | free-text, shared between both users |
| `possible_duplicate_of` | nullable FK to another `listings.id` |

### Deduplication

- **Exact dedup**: within the same source, match on `source_ref` (e.g. re-scraping Yad2 won't create duplicate rows for the same listing ID).
- **Cross-source dedup**: no automatic merging (address/price/room matching across sources is too fuzzy to trust blindly). Instead, a lightweight similarity check (matching area + price range + room count) flags candidates by setting `possible_duplicate_of`, and the dashboard surfaces these as a "possible duplicate — confirm?" prompt for the user to merge or dismiss manually. Exact thresholds (how close a price/room match needs to be, whether area matching is exact-string or fuzzy) are left to be tuned during implementation rather than fixed here. This check runs at insert time, as shared logic used by all three write paths (Yad2 upsert, Ingest API, manual quick-add) — not a separate batch job.

### Filter Criteria

Two complementary mechanisms, both shared/collaborative (no per-user ownership, same as `notes`/`favorited` — either person edits the same live set):

- **Structured rule builder** — operates on the already-structured fields (`price`, `rooms`, `area`, `move_in_date`). Rules are combinable (e.g. `price < 6000 AND rooms >= 3 AND area IN (X, Y)`), stored as a single shared active rule set (not multiple saved presets — one live shared filter, since only one filter view was requested). Table: `filter_rules` (`id`, `field`, `operator`, `value`, `rule_group` for AND/OR grouping — rules within the same `rule_group` are ANDed together, and groups themselves are ORed).
- **Free-text tags** — for fuzzy, non-structured criteria that only show up in a listing's description (e.g. "pet friendly", "not ground floor", "quiet street"). Either user adds a tag via the dashboard; an LLM call checks each listing's `raw_text` against the tag and records a result. Table: `tags` (`id`, `label`, `created_at`); join table `listing_tags` (`listing_id`, `tag_id`, `match_status` — one of `matched` / `unmatched` / `unclear`, `checked_at`).
  - **Retroactive re-scan**: adding a new tag immediately re-checks it against every existing listing's `raw_text` (not just future ingests), so nothing already in the feed is missed.
  - **Where this runs**: tag-matching is a separate process from ingestion, owned entirely by the Next.js app (which already needs LLM access for the Ingest API) — not by the Yad2 GitHub Actions workflow, which stays LLM-free per its Architecture description above. A Supabase database webhook fires on every `listings` insert (regardless of source, including Yad2's direct upserts) and calls a `/api/tags/check` route in the app, which runs LLM matching for that listing against all existing tags. Adding a new tag calls the same route to sweep it against all existing listings. This keeps the Yad2 scraper simple and decoupled from LLM calls while still covering every listing, whatever ingested it.

The dashboard combines both: structured rules narrow the feed first (fast, DB-level query), then tag-match state is shown per listing so either of you can see at a glance which of your fuzzy criteria a listing satisfies.

## Ingest API

`POST /api/listings/ingest` — the entry point for **unstructured, text-based** sources only (WhatsApp and Facebook on-demand tools; the manual quick-add box uses the same extraction logic in-process rather than calling this route). Accepts one or more raw-text payloads plus a source tag, runs them through LLM extraction to pull out structured fields, then dedups and inserts.

**Auth**: a shared secret API key, passed as a bearer token, required on every request. The key is stored as an environment variable (e.g. `INGEST_API_KEY`) that the on-demand Claude Code sessions read from local project config when calling the deployed endpoint. The Yad2 GitHub Actions workflow does not call this endpoint at all — it writes to Supabase directly using a service-role key (see Architecture above), so it needs no API key.

## Dashboard UI

- Unified feed of all listings, newest first.
- Structured rule builder (area/city, price range, room count, move-in date, and combinable custom rules) — see Filter Criteria above.
- Free-text tag manager — add/remove shared tags; each listing shows matched/unmatched/unclear per tag.
- Source badge per listing (Yad2 / Facebook / WhatsApp / manual).
- Favorite and hide actions per listing.
- Shared notes field per listing (visible/editable by both users).
- "Possible duplicate — confirm?" prompt on listings flagged by cross-source dedup, letting the user merge or dismiss.
- Quick-add box for manual paste ingestion.
- No multi-stage status pipeline (New → Contacted → etc.) in this version — favorite/hide/notes is enough for now. Explicitly deferred; the data model doesn't preclude adding a `status` field later.

## Out of Scope (this phase)

- Login/auth — dashboard is open via URL only.
- Scheduled WhatsApp or Facebook polling — both remain manual/on-demand due to account-risk and reliability concerns (see Architecture rationale above).
- Multi-stage application-tracking workflow (kanban-style status pipeline) — deferred until the core dashboard proves useful.
- Automatic merging of cross-source duplicates — flagged for manual confirmation only.

## Phasing

1. **MVP**: Next.js app on Vercel + Supabase schema + Yad2 GitHub Actions scraper + ingest API + dashboard (feed, structured rule builder, free-text tag manager with LLM matching, favorite/hide, notes, manual quick-add).
2. **Phase 2**: On-demand WhatsApp ingestion tool (computer-use flow + prompt for extracting listings from a named group).
3. **Phase 3**: On-demand Facebook ingestion tool (browser automation flow for a named group).

MVP is fully self-contained and doesn't depend on any live Claude Code session to keep running — only phases 2 and 3 require a Claude Code session to be invoked on demand.

The first implementation plan should cover **MVP only**. Phases 2 and 3 are largely independent subsystems (computer-use automation vs. browser automation) and should each get their own plan once the MVP is live.
