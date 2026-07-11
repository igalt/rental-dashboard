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
- **Yad2 ingestion**: automated, scheduled scraper (Puppeteer + puppeteer-extra-plugin-stealth, same approach proven in the MiloNesting project) running as a **GitHub Actions scheduled workflow** (cron). Free minutes cover this easily at low frequency (e.g. hourly). The workflow hits Yad2's public search-results pages for the saved search criteria, parses listings, and writes new/updated rows directly to Supabase.
- **WhatsApp ingestion**: **on-demand only**, never scheduled. Triggered by the user asking a Claude Code session to check WhatsApp groups. That session uses computer-use to open WhatsApp Desktop, read the group(s) the user names, extract listing-shaped messages via LLM parsing, and POST them to the app's ingest API endpoint.
- **Facebook ingestion**: **on-demand only**, never scheduled. Triggered the same way — a Claude Code session uses browser automation (the user's own logged-in session) to browse the specified Facebook group(s) once, extract new posts, and POST them to the ingest API.

  Rationale for both being on-demand rather than scheduled: Facebook aggressively detects automated browsing patterns on an account and can trigger checkpoints/lockouts; WhatsApp Desktop UI automation is fragile and disruptive (takes over mouse/keyboard) if run unattended on a schedule. On-demand keeps both to low-frequency, human-initiated use that looks like normal activity and avoids fighting for control of the Mac.

- **Manual paste**: a "quick add" box in the dashboard UI. Works for any source — user pastes raw text (a Facebook post, a WhatsApp message, anything), and the same LLM extraction pipeline used by the ingest API parses it into a listing.

## Data Model

Single `listings` table in Supabase, regardless of source:

| Field | Notes |
|---|---|
| `id` | primary key |
| `source` | `yad2` \| `facebook` \| `whatsapp` \| `manual` |
| `source_ref` | original URL or platform ID, used for exact-dedup within a source |
| `title` | |
| `price` | |
| `rooms` | |
| `area` | free-text neighborhood/city |
| `move_in_date` | |
| `raw_text` | original scraped/pasted text, kept for re-parsing or manual review |
| `extracted_at` | timestamp |
| `favorited` | boolean |
| `hidden` | boolean |
| `notes` | free-text, shared between both users |
| `possible_duplicate_of` | nullable FK to another `listings.id` |

### Deduplication

- **Exact dedup**: within the same source, match on `source_ref` (e.g. re-scraping Yad2 won't create duplicate rows for the same listing ID).
- **Cross-source dedup**: no automatic merging (address/price/room matching across sources is too fuzzy to trust blindly). Instead, a lightweight similarity check (matching area + price range + room count) flags candidates by setting `possible_duplicate_of`, and the dashboard surfaces these as a "possible duplicate — confirm?" prompt for the user to merge or dismiss manually.

## Ingest API

A single authenticated endpoint (e.g. `POST /api/listings/ingest`) accepts one or more listing payloads (raw text plus source tag) and runs them through the same LLM-extraction-and-dedup pipeline used elsewhere. This is what both the GitHub Actions Yad2 workflow and the on-demand WhatsApp/Facebook Claude Code sessions call — one ingestion path, regardless of where the data originated.

## Dashboard UI

- Unified feed of all listings, newest first.
- Filters: area/city, price range, room count, move-in date.
- Source badge per listing (Yad2 / Facebook / WhatsApp / manual).
- Favorite and hide actions per listing.
- Shared notes field per listing (visible/editable by both users).
- Quick-add box for manual paste ingestion.
- No multi-stage status pipeline (New → Contacted → etc.) in this version — favorite/hide/notes is enough for now. Explicitly deferred; the data model doesn't preclude adding a `status` field later.

## Out of Scope (this phase)

- Login/auth — dashboard is open via URL only.
- Scheduled WhatsApp or Facebook polling — both remain manual/on-demand due to account-risk and reliability concerns (see Architecture rationale above).
- Multi-stage application-tracking workflow (kanban-style status pipeline) — deferred until the core dashboard proves useful.
- Automatic merging of cross-source duplicates — flagged for manual confirmation only.

## Phasing

1. **MVP**: Next.js app on Vercel + Supabase schema + Yad2 GitHub Actions scraper + ingest API + dashboard (feed, filters, favorite/hide, notes, manual quick-add).
2. **Phase 2**: On-demand WhatsApp ingestion tool (computer-use flow + prompt for extracting listings from a named group).
3. **Phase 3**: On-demand Facebook ingestion tool (browser automation flow for a named group).

MVP is fully self-contained and doesn't depend on any live Claude Code session to keep running — only phases 2 and 3 require a Claude Code session to be invoked on demand.
