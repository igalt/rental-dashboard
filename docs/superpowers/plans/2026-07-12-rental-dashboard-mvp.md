# Rental Dashboard MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a hosted, shared dashboard that pools rental listings from Yad2 (automated), Facebook/WhatsApp (on-demand, later phases), and manual paste, with collaborative structured + free-text filtering, dedup, and delisting detection.

**Architecture:** Next.js (App Router) on Vercel, Supabase Postgres as the single data store with public read RLS and service-role-only writes, LLM-based extraction/tag-matching via the Anthropic SDK, a Puppeteer+stealth Yad2 scraper run on a GitHub Actions cron schedule, and a shared-secret-authenticated ingest surface for the on-demand Phase 2/3 tools (built in separate later plans).

**Tech Stack:** Next.js 16 (TypeScript, App Router), Tailwind, Supabase (`@supabase/supabase-js`), Anthropic SDK (`@anthropic-ai/sdk`), Vitest, Puppeteer + `puppeteer-extra` + `puppeteer-extra-plugin-stealth`, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-07-11-rental-dashboard-design.md`

---

## Prerequisites & Known Blockers

These need real values before the corresponding tasks can be fully finished. Tasks are ordered so everything that *can* be built and tested without them comes first; blocked tasks say exactly what they're waiting on.

| Needed | Used by | Status |
|---|---|---|
| Supabase project URL + anon key + service-role key | Tasks 2, 20 (deploy) | Not yet provided — user must create the project |
| Yad2 search URL (filters already applied on yad2.co.il) | Task 18 (scraper) | Not yet provided |
| Real Yad2 listing-card DOM structure | Task 18 (scraper selectors) | Requires live inspection of the actual search URL once available — the selectors in this plan are placeholders and **will** need correction |
| `ANTHROPIC_API_KEY` | Tasks 5, 7, 20 | Standard Anthropic API key, user provides |
| GitHub repo for this project (public/private?) | Task 20 | User decision needed |
| Vercel account linked to the repo | Task 20 | User must do the OAuth linking themselves |

**Important — this is a fresh Next.js scaffold.** The sibling project in this workspace (`Beatfulness Playlist Helper`) is pinned to `next@16.2.3` and its `AGENTS.md` warns that this major version has breaking changes from training-data assumptions and that `node_modules/next/dist/docs/` should be checked before writing routes/config. Task 1 includes a step to do the same check here, since `create-next-app` will likely pull the same major version.

---

### Task 1: Project scaffolding

**Files:**
- Create: whole Next.js project structure under `/Users/igaltar/Dropbox/AI/Claude Code/Rental Dashboard/`
- Create: `.env.example`
- Modify: `.gitignore`

- [ ] **Step 1: Scaffold Next.js**

Run (from the project root, which already has a `.git` and `docs/` from the spec):

```bash
npx create-next-app@latest . --typescript --tailwind --app --src-dir --import-alias "@/*" --eslint
```

If prompted about the non-empty directory (it has `.git`/`docs/`), confirm to proceed.

**Note (added after Task 1 was implemented):** this version of `create-next-app` no longer has a `--no-turbopack` flag — Turbopack is the default bundler for both dev and build regardless. Nothing in this plan requires Webpack specifically, so the default is fine; the flag has been removed from the command above to avoid confusion.

- [ ] **Step 2: Check installed Next.js version's docs for breaking changes**

Run: `cat node_modules/next/package.json | grep '"version"'`

Then check `ls node_modules/next/dist/docs/ 2>/dev/null` — if that directory exists, skim it for anything affecting Route Handlers (`app/api/.../route.ts`), `next.config.ts` format, or server actions, since this plan's code assumes the conventional App Router API. Note any divergence before continuing to later tasks.

- [ ] **Step 3: Install remaining dependencies**

```bash
npm install @supabase/supabase-js @anthropic-ai/sdk puppeteer-extra puppeteer-extra-plugin-stealth puppeteer
npm install -D vitest tsx @types/node
```

- [ ] **Step 4: Add test script**

Edit `package.json`, add to `"scripts"`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 5: Create `.env.example`**

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
INGEST_API_KEY=
```

(`YAD2_SEARCH_URL` is not listed here — it's only used by the GitHub Actions workflow, not the app itself, and is stored as a repo secret in Task 20.)

- [ ] **Step 6: Verify `.gitignore` excludes env files**

Run: `grep -q '^\.env' .gitignore || echo '.env*.local' >> .gitignore`

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Scaffold Next.js app with Supabase/Anthropic/Puppeteer deps"
```

---

### Task 2: Supabase schema + client helpers

**Files:**
- Create: `supabase/schema.sql`
- Create: `src/lib/supabase/server.ts`
- Create: `src/lib/supabase/browser.ts`
- Create: `src/lib/supabase/testUtils.ts`

- [ ] **Step 1: Write the schema**

Create `supabase/schema.sql`:

```sql
create extension if not exists "uuid-ossp";

create table listings (
  id uuid primary key default uuid_generate_v4(),
  source text not null check (source in ('yad2','facebook','whatsapp','manual')),
  source_ref text,
  title text,
  price numeric,
  rooms numeric,
  area text,
  move_in_date date,
  raw_text text,
  extracted_at timestamptz not null default now(),
  favorited boolean not null default false,
  irrelevant boolean not null default false,
  notes text,
  possible_duplicate_of uuid references listings(id),
  delisted_at timestamptz,
  updated_at timestamptz not null default now()
);

create unique index listings_source_ref_unique on listings (source, source_ref) where source_ref is not null;

create table filter_rules (
  id uuid primary key default uuid_generate_v4(),
  field text not null check (field in ('price','rooms','area','move_in_date')),
  operator text not null check (operator in ('eq','lt','lte','gt','gte','in')),
  value text not null,
  rule_group integer not null default 0,
  created_at timestamptz not null default now()
);

create table tags (
  id uuid primary key default uuid_generate_v4(),
  label text not null unique,
  created_at timestamptz not null default now()
);

create table listing_tags (
  listing_id uuid not null references listings(id) on delete cascade,
  tag_id uuid not null references tags(id) on delete cascade,
  match_status text not null check (match_status in ('matched','unmatched','unclear')),
  checked_at timestamptz not null default now(),
  primary key (listing_id, tag_id)
);

alter table listings enable row level security;
alter table filter_rules enable row level security;
alter table tags enable row level security;
alter table listing_tags enable row level security;

create policy "public read listings" on listings for select using (true);
create policy "public read filter_rules" on filter_rules for select using (true);
create policy "public read tags" on tags for select using (true);
create policy "public read listing_tags" on listing_tags for select using (true);
```

No write policies are defined — all writes go through Next.js API routes using the service-role key, which bypasses RLS entirely. This matches the "no login" decision: reads are public via the anon key, writes are server-mediated.

- [ ] **Step 2: Server (service-role) client**

Create `src/lib/supabase/server.ts`:

```ts
import { createClient } from '@supabase/supabase-js';

export function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
```

- [ ] **Step 3: Browser (anon) client**

Create `src/lib/supabase/browser.ts`:

```ts
import { createClient } from '@supabase/supabase-js';

export function getBrowserClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

- [ ] **Step 4: Test double for chainable Supabase queries**

Create `src/lib/supabase/testUtils.ts`:

```ts
import { vi } from 'vitest';

export function createFakeQueryBuilder(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  const chainMethods = ['select', 'insert', 'update', 'upsert', 'delete', 'eq', 'neq', 'ilike', 'gte', 'lte', 'limit', 'single', 'or', 'order', 'is'];
  for (const method of chainMethods) {
    builder[method] = vi.fn(() => builder);
  }
  (builder as any).then = (resolve: (r: { data: unknown; error: unknown }) => unknown) => resolve(result);
  return builder;
}

export function createFakeSupabase(results: Record<string, { data: unknown; error: unknown }>) {
  const builders: Record<string, ReturnType<typeof createFakeQueryBuilder>> = {};
  const from = vi.fn((table: string) => {
    builders[table] = builders[table] ?? createFakeQueryBuilder(results[table] ?? { data: null, error: null });
    return builders[table];
  });
  return { from, builders };
}
```

Each table gets one cached fake query builder per test, with every chain method spied via `vi.fn()` so tests can assert on call arguments (e.g. `builders.listings.insert`).

- [ ] **Step 5: Commit**

```bash
git add supabase/ src/lib/supabase/
git commit -m "Add Supabase schema and client helpers"
```

---

### Task 3: Shared types

**Files:**
- Create: `src/types/listing.ts`

- [ ] **Step 1: Write types**

```ts
export type Source = 'yad2' | 'facebook' | 'whatsapp' | 'manual';
export type MatchStatus = 'matched' | 'unmatched' | 'unclear';
export type RuleOperator = 'eq' | 'lt' | 'lte' | 'gt' | 'gte' | 'in';
export type RuleField = 'price' | 'rooms' | 'area' | 'move_in_date';

export interface Listing {
  id: string;
  source: Source;
  source_ref: string | null;
  title: string | null;
  price: number | null;
  rooms: number | null;
  area: string | null;
  move_in_date: string | null;
  raw_text: string | null;
  extracted_at: string;
  favorited: boolean;
  irrelevant: boolean;
  notes: string | null;
  possible_duplicate_of: string | null;
  delisted_at: string | null;
  updated_at: string;
}

export interface FilterRule {
  id: string;
  field: RuleField;
  operator: RuleOperator;
  value: string;
  rule_group: number;
}

export interface Tag {
  id: string;
  label: string;
}

export interface ListingTag {
  listing_id: string;
  tag_id: string;
  match_status: MatchStatus;
  checked_at: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/types/
git commit -m "Add shared listing/rule/tag types"
```

---

### Task 4: LLM client wrapper

**Files:**
- Create: `src/lib/llm/client.ts`

- [ ] **Step 1: Write the wrapper**

```ts
import Anthropic from '@anthropic-ai/sdk';

export type LLMCaller = (prompt: string) => Promise<string>;

export const defaultLLMCaller: LLMCaller = async (prompt) => {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const message = await client.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 500,
    messages: [{ role: 'user', content: prompt }],
  });
  const block = message.content[0];
  return block.type === 'text' ? block.text : '';
};
```

This is the only place that touches the Anthropic SDK directly. Every consumer (extraction, tag-matching) takes an injectable `LLMCaller`, defaulting to this one, so tests never make real network calls.

- [ ] **Step 2: Commit**

```bash
git add src/lib/llm/
git commit -m "Add LLM client wrapper"
```

---

### Task 5: Extraction logic

**Files:**
- Create: `src/lib/extraction/extractListing.ts`
- Test: `src/lib/extraction/extractListing.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { extractListing } from './extractListing';

describe('extractListing', () => {
  it('parses a JSON response from the LLM caller', async () => {
    const fakeCaller = async () =>
      JSON.stringify({
        title: '3-room apartment in Florentin',
        price: 5800,
        rooms: 3,
        area: 'Florentin, Tel Aviv',
        move_in_date: '2026-09-01',
      });

    const result = await extractListing('some raw whatsapp text', fakeCaller);

    expect(result).toEqual({
      title: '3-room apartment in Florentin',
      price: 5800,
      rooms: 3,
      area: 'Florentin, Tel Aviv',
      move_in_date: '2026-09-01',
    });
  });

  it('returns nulls when the caller returns unparseable text', async () => {
    const fakeCaller = async () => 'sorry, I cannot help with that';
    const result = await extractListing('garbage', fakeCaller);
    expect(result).toEqual({ title: null, price: null, rooms: null, area: null, move_in_date: null });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/extraction/extractListing.test.ts`
Expected: FAIL — `extractListing` is not defined (file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

```ts
import { LLMCaller, defaultLLMCaller } from '../llm/client';

export interface ExtractedListing {
  title: string | null;
  price: number | null;
  rooms: number | null;
  area: string | null;
  move_in_date: string | null;
}

const EMPTY: ExtractedListing = { title: null, price: null, rooms: null, area: null, move_in_date: null };

export async function extractListing(
  rawText: string,
  caller: LLMCaller = defaultLLMCaller
): Promise<ExtractedListing> {
  const prompt = `Extract rental listing fields from the text below as strict JSON with keys title, price (number or null), rooms (number or null), area (string or null), move_in_date (YYYY-MM-DD string or null). Only return the JSON object, nothing else.

Text:
${rawText}`;

  const responseText = await caller(prompt);
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return EMPTY;

  try {
    return { ...EMPTY, ...JSON.parse(jsonMatch[0]) };
  } catch {
    return EMPTY;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/extraction/extractListing.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/extraction/
git commit -m "Add LLM-based listing field extraction"
```

---

### Task 6: Dedup logic

**Files:**
- Create: `src/lib/dedup/findPossibleDuplicate.ts`
- Test: `src/lib/dedup/findPossibleDuplicate.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { createFakeSupabase } from '../supabase/testUtils';
import { findPossibleDuplicate } from './findPossibleDuplicate';

describe('findPossibleDuplicate', () => {
  it('returns the matching listing id when price/rooms/area are close', async () => {
    const fake = createFakeSupabase({
      listings: { data: [{ id: 'existing-1' }], error: null },
    });

    const result = await findPossibleDuplicate(fake as any, {
      price: 5800,
      rooms: 3,
      area: 'Florentin',
    });

    expect(result).toBe('existing-1');
  });

  it('returns null when required fields are missing', async () => {
    const fake = createFakeSupabase({ listings: { data: [], error: null } });
    const result = await findPossibleDuplicate(fake as any, { price: null, rooms: 3, area: 'Florentin' });
    expect(result).toBeNull();
  });

  it('returns null when nothing matches', async () => {
    const fake = createFakeSupabase({ listings: { data: [], error: null } });
    const result = await findPossibleDuplicate(fake as any, { price: 5800, rooms: 3, area: 'Florentin' });
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/dedup/findPossibleDuplicate.test.ts`
Expected: FAIL — module doesn't exist yet.

- [ ] **Step 3: Write the implementation**

```ts
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
```

Exact thresholds are intentionally loose per the spec ("left to be tuned during implementation") — 10% price tolerance and exact room count is the starting point.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/dedup/findPossibleDuplicate.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/dedup/
git commit -m "Add cross-source possible-duplicate detection"
```

---

### Task 7: Tag matching logic

**Files:**
- Create: `src/lib/tags/matchTag.ts`
- Test: `src/lib/tags/matchTag.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { matchTag } from './matchTag';

describe('matchTag', () => {
  it('returns matched', async () => {
    const result = await matchTag('raw text', 'pet friendly', async () => 'matched');
    expect(result).toBe('matched');
  });

  it('returns unmatched (and does not get confused by "matched" being a substring of "unmatched")', async () => {
    const result = await matchTag('raw text', 'pet friendly', async () => 'unmatched');
    expect(result).toBe('unmatched');
  });

  it('returns unclear for anything else', async () => {
    const result = await matchTag('raw text', 'pet friendly', async () => 'not sure honestly');
    expect(result).toBe('unclear');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/tags/matchTag.test.ts`
Expected: FAIL — module doesn't exist yet.

- [ ] **Step 3: Write the implementation**

```ts
import { LLMCaller, defaultLLMCaller } from '../llm/client';
import type { MatchStatus } from '../../types/listing';

export async function matchTag(
  rawText: string,
  tagLabel: string,
  caller: LLMCaller = defaultLLMCaller
): Promise<MatchStatus> {
  const prompt = `Does the following rental listing match this criterion: "${tagLabel}"? Reply with exactly one word: matched, unmatched, or unclear.

Listing text:
${rawText}`;

  const response = (await caller(prompt)).trim().toLowerCase();
  // Check "unmatched" before "matched" — "unmatched" contains "matched" as a substring.
  if (response.includes('unmatched')) return 'unmatched';
  if (response.includes('matched')) return 'matched';
  return 'unclear';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/tags/matchTag.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/tags/
git commit -m "Add LLM-based free-text tag matching"
```

---

### Task 8: Rule evaluation (structured filter → PostgREST filter string)

**Files:**
- Create: `src/lib/rules/buildFilterString.ts`
- Test: `src/lib/rules/buildFilterString.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { buildFilterString } from './buildFilterString';
import type { FilterRule } from '../../types/listing';

const rule = (over: Partial<FilterRule>): FilterRule => ({
  id: 'x',
  field: 'price',
  operator: 'lt',
  value: '6000',
  rule_group: 0,
  ...over,
});

describe('buildFilterString', () => {
  it('returns null for no rules', () => {
    expect(buildFilterString([])).toBeNull();
  });

  it('ANDs rules within the same group', () => {
    const rules = [rule({ field: 'price', operator: 'lt', value: '6000' }), rule({ field: 'rooms', operator: 'gte', value: '3' })];
    expect(buildFilterString(rules)).toBe('or(and(price.lt.6000,rooms.gte.3))');
  });

  it('ORs across different groups', () => {
    const rules = [
      rule({ field: 'area', operator: 'eq', value: 'North', rule_group: 0 }),
      rule({ field: 'area', operator: 'eq', value: 'South', rule_group: 1 }),
    ];
    expect(buildFilterString(rules)).toBe('or(area.eq.North,area.eq.South)');
  });

  it('formats "in" operator values as a parenthesized list', () => {
    const rules = [rule({ field: 'area', operator: 'in', value: 'North, South' })];
    expect(buildFilterString(rules)).toBe('or(area.in.(North,South))');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/rules/buildFilterString.test.ts`
Expected: FAIL — module doesn't exist yet.

- [ ] **Step 3: Write the implementation**

```ts
import type { FilterRule } from '../../types/listing';

export function buildFilterString(rules: FilterRule[]): string | null {
  if (rules.length === 0) return null;

  const groups = new Map<number, FilterRule[]>();
  for (const rule of rules) {
    const list = groups.get(rule.rule_group) ?? [];
    list.push(rule);
    groups.set(rule.rule_group, list);
  }

  const groupStrings = Array.from(groups.values()).map((groupRules) => {
    const conditions = groupRules.map((r) => {
      if (r.operator === 'in') {
        const values = r.value.split(',').map((v) => v.trim()).join(',');
        return `${r.field}.in.(${values})`;
      }
      return `${r.field}.${r.operator}.${r.value}`;
    });
    return conditions.length === 1 ? conditions[0] : `and(${conditions.join(',')})`;
  });

  return `or(${groupStrings.join(',')})`;
}
```

This is passed directly to Supabase's `.or(filterString)` — rules in the same `rule_group` are ANDed, groups are ORed, matching the spec's semantics.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/rules/buildFilterString.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/rules/
git commit -m "Add structured filter rule evaluation"
```

---

### Task 9: Ingest API route

**Files:**
- Create: `src/app/api/listings/ingest/route.ts`
- Test: `src/app/api/listings/ingest/route.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../lib/supabase/server', () => ({ getServiceClient: vi.fn() }));
vi.mock('../../../../lib/extraction/extractListing', () => ({ extractListing: vi.fn() }));
vi.mock('../../../../lib/dedup/findPossibleDuplicate', () => ({ findPossibleDuplicate: vi.fn() }));

import { getServiceClient } from '../../../../lib/supabase/server';
import { extractListing } from '../../../../lib/extraction/extractListing';
import { findPossibleDuplicate } from '../../../../lib/dedup/findPossibleDuplicate';
import { createFakeSupabase } from '../../../../lib/supabase/testUtils';
import { POST } from './route';
import { NextRequest } from 'next/server';

beforeEach(() => {
  process.env.INGEST_API_KEY = 'test-key';
  vi.mocked(extractListing).mockResolvedValue({
    title: 'Nice place', price: 5000, rooms: 3, area: 'Florentin', move_in_date: '2026-09-01',
  });
  vi.mocked(findPossibleDuplicate).mockResolvedValue(null);
});

function makeRequest(body: unknown, authorized = true) {
  return new NextRequest('http://localhost/api/listings/ingest', {
    method: 'POST',
    headers: authorized ? { authorization: 'Bearer test-key' } : {},
    body: JSON.stringify(body),
  });
}

describe('POST /api/listings/ingest', () => {
  it('rejects unauthorized requests', async () => {
    const response = await POST(makeRequest({ source: 'manual', raw_text: 'x' }, false));
    expect(response.status).toBe(401);
  });

  it('extracts, dedups, and inserts a listing', async () => {
    const fake = createFakeSupabase({
      listings: { data: { id: 'new-id' }, error: null },
    });
    vi.mocked(getServiceClient).mockReturnValue(fake as any);

    const response = await POST(makeRequest({ source: 'whatsapp', raw_text: 'raw text here' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.inserted).toHaveLength(1);
    expect(fake.builders.listings.insert).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'whatsapp', title: 'Nice place', price: 5000 })
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/listings/ingest/route.test.ts`
Expected: FAIL — `route.ts` doesn't exist yet.

- [ ] **Step 3: Write the implementation**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '../../../../lib/supabase/server';
import { extractListing } from '../../../../lib/extraction/extractListing';
import { findPossibleDuplicate } from '../../../../lib/dedup/findPossibleDuplicate';

interface IngestPayload {
  source: 'facebook' | 'whatsapp' | 'manual';
  raw_text: string;
  source_ref?: string;
}

function isAuthorized(request: NextRequest): boolean {
  return request.headers.get('authorization') === `Bearer ${process.env.INGEST_API_KEY}`;
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const payloads: IngestPayload[] = Array.isArray(body) ? body : [body];
  const supabase = getServiceClient();
  const inserted = [];

  for (const payload of payloads) {
    const extracted = await extractListing(payload.raw_text);
    const duplicateId = await findPossibleDuplicate(supabase, {
      price: extracted.price,
      rooms: extracted.rooms,
      area: extracted.area,
    });

    const { data, error } = await supabase
      .from('listings')
      .insert({
        source: payload.source,
        source_ref: payload.source_ref ?? null,
        title: extracted.title,
        price: extracted.price,
        rooms: extracted.rooms,
        area: extracted.area,
        move_in_date: extracted.move_in_date,
        raw_text: payload.raw_text,
        possible_duplicate_of: duplicateId,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    inserted.push(data);
  }

  return NextResponse.json({ inserted });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/api/listings/ingest/route.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/api/listings/ingest/
git commit -m "Add ingest API route for unstructured listing text"
```

---

### Task 10: Tags-check API route

**Files:**
- Create: `src/app/api/tags/check/route.ts`
- Test: `src/app/api/tags/check/route.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../lib/supabase/server', () => ({ getServiceClient: vi.fn() }));
vi.mock('../../../../lib/tags/matchTag', () => ({ matchTag: vi.fn() }));

import { getServiceClient } from '../../../../lib/supabase/server';
import { matchTag } from '../../../../lib/tags/matchTag';
import { createFakeSupabase } from '../../../../lib/supabase/testUtils';
import { POST } from './route';
import { NextRequest } from 'next/server';

beforeEach(() => {
  process.env.INGEST_API_KEY = 'test-key';
  vi.mocked(matchTag).mockResolvedValue('matched');
});

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost/api/tags/check', {
    method: 'POST',
    headers: { authorization: 'Bearer test-key' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/tags/check', () => {
  it('checks one listing against all tags (Supabase webhook shape)', async () => {
    const fake = createFakeSupabase({
      listings: { data: { id: 'l1', raw_text: 'pet friendly place' }, error: null },
      tags: { data: [{ id: 't1', label: 'pet friendly' }], error: null },
      listing_tags: { data: null, error: null },
    });
    vi.mocked(getServiceClient).mockReturnValue(fake as any);

    const response = await POST(makeRequest({ type: 'INSERT', table: 'listings', record: { id: 'l1' } }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.checked).toBe(1);
    expect(fake.builders.listing_tags.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ listing_id: 'l1', tag_id: 't1', match_status: 'matched' })
    );
  });

  it('checks one tag against all listings (new-tag sweep shape)', async () => {
    const fake = createFakeSupabase({
      tags: { data: { id: 't1', label: 'pet friendly' }, error: null },
      listings: { data: [{ id: 'l1', raw_text: 'text 1' }, { id: 'l2', raw_text: 'text 2' }], error: null },
      listing_tags: { data: null, error: null },
    });
    vi.mocked(getServiceClient).mockReturnValue(fake as any);

    const response = await POST(makeRequest({ tag_id: 't1' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.checked).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/tags/check/route.test.ts`
Expected: FAIL — `route.ts` doesn't exist yet.

- [ ] **Step 3: Write the implementation**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '../../../../lib/supabase/server';
import { matchTag } from '../../../../lib/tags/matchTag';

function isAuthorized(request: NextRequest): boolean {
  return request.headers.get('authorization') === `Bearer ${process.env.INGEST_API_KEY}`;
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  // Supabase Database Webhooks send { type, table, record, schema, old_record }.
  // The new-tag sweep (triggered from our own tag-creation route) sends { tag_id }.
  const listingId: string | undefined = body.record?.id ?? body.listing_id;
  const tagId: string | undefined = body.tag_id;

  const supabase = getServiceClient();

  if (listingId) {
    const { data: listing, error: listingError } = await supabase
      .from('listings')
      .select('id, raw_text')
      .eq('id', listingId)
      .single();
    if (listingError || !listing) {
      return NextResponse.json({ error: 'listing not found' }, { status: 404 });
    }

    const { data: tags, error: tagsError } = await supabase.from('tags').select('id, label');
    if (tagsError) return NextResponse.json({ error: tagsError.message }, { status: 500 });

    for (const tag of (tags as { id: string; label: string }[]) ?? []) {
      const matchStatus = await matchTag((listing as { raw_text: string }).raw_text ?? '', tag.label);
      await supabase.from('listing_tags').upsert({
        listing_id: (listing as { id: string }).id,
        tag_id: tag.id,
        match_status: matchStatus,
        checked_at: new Date().toISOString(),
      });
    }
    return NextResponse.json({ checked: tags?.length ?? 0 });
  }

  if (tagId) {
    const { data: tag, error: tagError } = await supabase
      .from('tags')
      .select('id, label')
      .eq('id', tagId)
      .single();
    if (tagError || !tag) {
      return NextResponse.json({ error: 'tag not found' }, { status: 404 });
    }

    const { data: listings, error: listingsError } = await supabase.from('listings').select('id, raw_text');
    if (listingsError) return NextResponse.json({ error: listingsError.message }, { status: 500 });

    for (const listing of (listings as { id: string; raw_text: string }[]) ?? []) {
      const matchStatus = await matchTag(listing.raw_text ?? '', (tag as { label: string }).label);
      await supabase.from('listing_tags').upsert({
        listing_id: listing.id,
        tag_id: (tag as { id: string }).id,
        match_status: matchStatus,
        checked_at: new Date().toISOString(),
      });
    }
    return NextResponse.json({ checked: listings?.length ?? 0 });
  }

  return NextResponse.json({ error: 'listing_id or tag_id required' }, { status: 400 });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/api/tags/check/route.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/api/tags/check/
git commit -m "Add tag-matching sweep route for webhook and tag-sweep triggers"
```

---

### Task 11: Filter rules CRUD API

**Files:**
- Create: `src/app/api/filter-rules/route.ts`
- Test: `src/app/api/filter-rules/route.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/supabase/server', () => ({ getServiceClient: vi.fn() }));

import { getServiceClient } from '../../../lib/supabase/server';
import { createFakeSupabase } from '../../../lib/supabase/testUtils';
import { GET, POST, DELETE } from './route';
import { NextRequest } from 'next/server';

describe('/api/filter-rules', () => {
  it('GET lists all rules', async () => {
    const fake = createFakeSupabase({ filter_rules: { data: [{ id: 'r1' }], error: null } });
    vi.mocked(getServiceClient).mockReturnValue(fake as any);

    const response = await GET();
    const body = await response.json();
    expect(body.rules).toEqual([{ id: 'r1' }]);
  });

  it('POST inserts a rule', async () => {
    const fake = createFakeSupabase({ filter_rules: { data: { id: 'r2' }, error: null } });
    vi.mocked(getServiceClient).mockReturnValue(fake as any);

    const request = new NextRequest('http://localhost/api/filter-rules', {
      method: 'POST',
      body: JSON.stringify({ field: 'price', operator: 'lt', value: '6000', rule_group: 0 }),
    });
    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(fake.builders.filter_rules.insert).toHaveBeenCalled();
  });

  it('DELETE removes a rule by id', async () => {
    const fake = createFakeSupabase({ filter_rules: { data: null, error: null } });
    vi.mocked(getServiceClient).mockReturnValue(fake as any);

    const request = new NextRequest('http://localhost/api/filter-rules?id=r1', { method: 'DELETE' });
    const response = await DELETE(request);
    expect(response.status).toBe(200);
    expect(fake.builders.filter_rules.eq).toHaveBeenCalledWith('id', 'r1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/filter-rules/route.test.ts`
Expected: FAIL — `route.ts` doesn't exist yet.

- [ ] **Step 3: Write the implementation**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '../../../lib/supabase/server';

export async function GET() {
  const supabase = getServiceClient();
  const { data, error } = await supabase.from('filter_rules').select('*');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rules: data });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from('filter_rules')
    .insert({ field: body.field, operator: body.operator, value: body.value, rule_group: body.rule_group ?? 0 })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rule: data });
}

export async function DELETE(request: NextRequest) {
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const supabase = getServiceClient();
  const { error } = await supabase.from('filter_rules').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

Note: `delete` is already in the `chainMethods` list from Task 2.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/api/filter-rules/route.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/api/filter-rules/ src/lib/supabase/testUtils.ts
git commit -m "Add filter rules CRUD API"
```

---

### Task 12: Tags CRUD API

**Files:**
- Create: `src/app/api/tags/route.ts`
- Test: `src/app/api/tags/route.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/supabase/server', () => ({ getServiceClient: vi.fn() }));
global.fetch = vi.fn(async () => new Response(JSON.stringify({ checked: 0 }), { status: 200 })) as any;

import { getServiceClient } from '../../../lib/supabase/server';
import { createFakeSupabase } from '../../../lib/supabase/testUtils';
import { GET, POST, DELETE } from './route';
import { NextRequest } from 'next/server';

beforeEach(() => {
  process.env.INGEST_API_KEY = 'test-key';
});

describe('/api/tags', () => {
  it('GET lists all tags', async () => {
    const fake = createFakeSupabase({ tags: { data: [{ id: 't1', label: 'pet friendly' }], error: null } });
    vi.mocked(getServiceClient).mockReturnValue(fake as any);
    const response = await GET();
    const body = await response.json();
    expect(body.tags).toEqual([{ id: 't1', label: 'pet friendly' }]);
  });

  it('POST inserts a tag and triggers a sweep against existing listings', async () => {
    const fake = createFakeSupabase({ tags: { data: { id: 't2', label: 'quiet street' }, error: null } });
    vi.mocked(getServiceClient).mockReturnValue(fake as any);

    const request = new NextRequest('http://localhost/api/tags', {
      method: 'POST',
      body: JSON.stringify({ label: 'quiet street' }),
    });
    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/tags/check'),
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('DELETE removes a tag by id', async () => {
    const fake = createFakeSupabase({ tags: { data: null, error: null } });
    vi.mocked(getServiceClient).mockReturnValue(fake as any);
    const request = new NextRequest('http://localhost/api/tags?id=t1', { method: 'DELETE' });
    const response = await DELETE(request);
    expect(response.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/tags/route.test.ts`
Expected: FAIL — `route.ts` doesn't exist yet.

- [ ] **Step 3: Write the implementation**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '../../../lib/supabase/server';

export async function GET() {
  const supabase = getServiceClient();
  const { data, error } = await supabase.from('tags').select('*');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tags: data });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const supabase = getServiceClient();
  const { data, error } = await supabase.from('tags').insert({ label: body.label }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const tag = data as { id: string };
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;
  await fetch(`${baseUrl}/api/tags/check`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${process.env.INGEST_API_KEY}`,
    },
    body: JSON.stringify({ tag_id: tag.id }),
  });

  return NextResponse.json({ tag: data });
}

export async function DELETE(request: NextRequest) {
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const supabase = getServiceClient();
  const { error } = await supabase.from('tags').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

The sweep call is fire-and-forget from the response's perspective but is `await`ed here so the route only returns once the sweep has been kicked off (not necessarily finished — matching happens listing-by-listing inside `/api/tags/check`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/api/tags/route.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/api/tags/route.ts src/app/api/tags/route.test.ts
git commit -m "Add tags CRUD API with new-tag sweep trigger"
```

---

### Task 13: Listings feed API

**Files:**
- Create: `src/app/api/listings/route.ts`
- Test: `src/app/api/listings/route.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../lib/supabase/server', () => ({ getServiceClient: vi.fn() }));
vi.mock('../../../lib/rules/buildFilterString', () => ({ buildFilterString: vi.fn() }));

import { getServiceClient } from '../../../lib/supabase/server';
import { buildFilterString } from '../../../lib/rules/buildFilterString';
import { createFakeSupabase } from '../../../lib/supabase/testUtils';
import { GET } from './route';
import { NextRequest } from 'next/server';

describe('GET /api/listings', () => {
  it('excludes delisted listings by default and applies stored rules', async () => {
    vi.mocked(buildFilterString).mockReturnValue('or(price.lt.6000)');
    const fake = createFakeSupabase({
      filter_rules: { data: [{ id: 'r1', field: 'price', operator: 'lt', value: '6000', rule_group: 0 }], error: null },
      listings: { data: [{ id: 'l1' }], error: null },
    });
    vi.mocked(getServiceClient).mockReturnValue(fake as any);

    const request = new NextRequest('http://localhost/api/listings');
    const response = await GET(request);
    const body = await response.json();

    expect(body.listings).toEqual([{ id: 'l1' }]);
    expect(fake.builders.listings.eq).toHaveBeenCalledWith('irrelevant', false);
    expect(fake.builders.listings.or).toHaveBeenCalledWith('or(price.lt.6000)');
  });

  it('includes delisted listings when show_delisted=true is passed', async () => {
    vi.mocked(buildFilterString).mockReturnValue(null);
    const fake = createFakeSupabase({
      filter_rules: { data: [], error: null },
      listings: { data: [], error: null },
    });
    vi.mocked(getServiceClient).mockReturnValue(fake as any);

    const request = new NextRequest('http://localhost/api/listings?show_delisted=true');
    await GET(request);
    expect(fake.builders.listings.or).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/listings/route.test.ts`
Expected: FAIL — `route.ts` doesn't exist yet.

- [ ] **Step 3: Write the implementation**

Note: `or` and `order` are already in the `chainMethods` list from Task 2.

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '../../../lib/supabase/server';
import { buildFilterString } from '../../../lib/rules/buildFilterString';
import type { FilterRule } from '../../../types/listing';

export async function GET(request: NextRequest) {
  const showDelisted = request.nextUrl.searchParams.get('show_delisted') === 'true';
  const supabase = getServiceClient();

  const { data: rules, error: rulesError } = await supabase.from('filter_rules').select('*');
  if (rulesError) return NextResponse.json({ error: rulesError.message }, { status: 500 });

  let query = supabase.from('listings').select('*').order('extracted_at', { ascending: false });

  if (!showDelisted) {
    query = query.eq('irrelevant', false).is('delisted_at', null);
  }

  const filterString = buildFilterString((rules as FilterRule[]) ?? []);
  if (filterString) {
    query = query.or(filterString);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ listings: data });
}
```

Note: the test above asserts `eq('irrelevant', false)` is called for the default case — `is('delisted_at', null)` is also called but not asserted in the sample test. `is` is already in the `chainMethods` list from Task 2.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/api/listings/route.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/api/listings/route.ts src/app/api/listings/route.test.ts src/lib/supabase/testUtils.ts
git commit -m "Add listings feed API with rule filtering and delisted exclusion"
```

---

### Task 14: Listing update API (favorite / irrelevant / notes)

**Files:**
- Create: `src/app/api/listings/[id]/route.ts`
- Test: `src/app/api/listings/[id]/route.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../../lib/supabase/server', () => ({ getServiceClient: vi.fn() }));

import { getServiceClient } from '../../../../lib/supabase/server';
import { createFakeSupabase } from '../../../../lib/supabase/testUtils';
import { PATCH } from './route';
import { NextRequest } from 'next/server';

describe('PATCH /api/listings/[id]', () => {
  it('updates favorited/irrelevant/notes', async () => {
    const fake = createFakeSupabase({ listings: { data: { id: 'l1', favorited: true }, error: null } });
    vi.mocked(getServiceClient).mockReturnValue(fake as any);

    const request = new NextRequest('http://localhost/api/listings/l1', {
      method: 'PATCH',
      body: JSON.stringify({ favorited: true, notes: 'called them' }),
    });
    const response = await PATCH(request, { params: Promise.resolve({ id: 'l1' }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.listing.favorited).toBe(true);
    expect(fake.builders.listings.update).toHaveBeenCalledWith(
      expect.objectContaining({ favorited: true, notes: 'called them' })
    );
    expect(fake.builders.listings.eq).toHaveBeenCalledWith('id', 'l1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "src/app/api/listings/[id]/route.test.ts"`
Expected: FAIL — `route.ts` doesn't exist yet.

- [ ] **Step 3: Write the implementation**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '../../../../lib/supabase/server';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const body = await request.json();
  const allowedFields = ['favorited', 'irrelevant', 'notes'] as const;
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const field of allowedFields) {
    if (field in body) update[field] = body[field];
  }

  const supabase = getServiceClient();
  const { data, error } = await supabase.from('listings').update(update).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ listing: data });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "src/app/api/listings/[id]/route.test.ts"`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/listings/[id]/"
git commit -m "Add listing update API for favorite/irrelevant/notes"
```

---

### Task 15: Duplicate merge/dismiss API

**Files:**
- Create: `src/app/api/listings/[id]/duplicate/route.ts`
- Test: `src/app/api/listings/[id]/duplicate/route.test.ts`

- [ ] **Step 1: Write the failing test**

The shared `createFakeSupabase` test util (Task 2) returns one fixed result per table regardless of which `id` was queried — it can't represent "fetch record A, then fetch record B, get different data for each," which this route needs (it compares two listings' `updated_at`). This test uses a small dedicated fake instead.

```ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../../../lib/supabase/server', () => ({ getServiceClient: vi.fn() }));

import { getServiceClient } from '../../../../../lib/supabase/server';
import { POST } from './route';
import { NextRequest } from 'next/server';

function makeRequest(action: string) {
  return new NextRequest('http://localhost/api/listings/l1/duplicate', {
    method: 'POST',
    body: JSON.stringify({ action }),
  });
}

// Tracks which id was last queried and returns matching canned data for that id;
// records every update() call so tests can assert on which id got which patch.
function makeListingsFake(recordsById: Record<string, unknown>) {
  const updateCalls: { id: string; patch: Record<string, unknown> }[] = [];
  let queriedId: string | undefined;

  const builder: any = {
    select: vi.fn(() => builder),
    eq: vi.fn((col: string, val: string) => {
      if (col === 'id') queriedId = val;
      return builder;
    }),
    update: vi.fn((patch: Record<string, unknown>) => {
      updateCalls.push({ id: queriedId!, patch });
      return builder;
    }),
    single: vi.fn(() => Promise.resolve({ data: recordsById[queriedId!], error: null })),
    then: (resolve: (r: { data: unknown; error: null }) => unknown) =>
      resolve({ data: recordsById[queriedId!], error: null }),
  };

  return { from: vi.fn(() => builder), updateCalls };
}

describe('POST /api/listings/[id]/duplicate', () => {
  it('dismiss clears the possible_duplicate_of flag', async () => {
    const fake = makeListingsFake({ l1: { id: 'l1' } });
    vi.mocked(getServiceClient).mockReturnValue(fake as any);

    const response = await POST(makeRequest('dismiss'), { params: Promise.resolve({ id: 'l1' }) });
    expect(response.status).toBe(200);
    expect(fake.updateCalls[0]).toEqual({ id: 'l1', patch: { possible_duplicate_of: null } });
  });

  it('merge marks the OLDER record irrelevant even when the newer one was clicked', async () => {
    const fake = makeListingsFake({
      l1: { id: 'l1', possible_duplicate_of: 'l2', updated_at: '2026-07-10T00:00:00Z' }, // requested, newer
      l2: { id: 'l2', updated_at: '2026-07-01T00:00:00Z' }, // older
    });
    vi.mocked(getServiceClient).mockReturnValue(fake as any);

    const response = await POST(makeRequest('merge'), { params: Promise.resolve({ id: 'l1' }) });
    expect(response.status).toBe(200);

    const irrelevantUpdate = fake.updateCalls.find((c) => c.patch.irrelevant === true);
    expect(irrelevantUpdate?.id).toBe('l2');
  });

  it('merge marks the requested record irrelevant when IT is the older one', async () => {
    const fake = makeListingsFake({
      l1: { id: 'l1', possible_duplicate_of: 'l2', updated_at: '2026-07-01T00:00:00Z' }, // requested, older
      l2: { id: 'l2', updated_at: '2026-07-10T00:00:00Z' }, // newer
    });
    vi.mocked(getServiceClient).mockReturnValue(fake as any);

    const response = await POST(makeRequest('merge'), { params: Promise.resolve({ id: 'l1' }) });
    expect(response.status).toBe(200);

    const irrelevantUpdate = fake.updateCalls.find((c) => c.patch.irrelevant === true);
    expect(irrelevantUpdate?.id).toBe('l1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "src/app/api/listings/[id]/duplicate/route.test.ts"`
Expected: FAIL — `route.ts` doesn't exist yet.

- [ ] **Step 3: Write the implementation**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '../../../../../lib/supabase/server';

interface RouteContext {
  params: Promise<{ id: string }>;
}

interface ListingRecord {
  id: string;
  possible_duplicate_of?: string | null;
  updated_at: string;
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const { action } = await request.json();
  const supabase = getServiceClient();

  if (action === 'dismiss') {
    const { data, error } = await supabase
      .from('listings')
      .update({ possible_duplicate_of: null })
      .eq('id', id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ listing: data });
  }

  if (action === 'merge') {
    const { data: current, error: currentError } = await supabase
      .from('listings')
      .select('id, possible_duplicate_of, updated_at')
      .eq('id', id)
      .single();
    if (currentError || !current) {
      return NextResponse.json({ error: 'listing not found' }, { status: 404 });
    }

    const currentRecord = current as ListingRecord;
    if (!currentRecord.possible_duplicate_of) {
      return NextResponse.json({ error: 'no duplicate to merge' }, { status: 400 });
    }

    const { data: other, error: otherError } = await supabase
      .from('listings')
      .select('id, updated_at')
      .eq('id', currentRecord.possible_duplicate_of)
      .single();
    if (otherError || !other) {
      return NextResponse.json({ error: 'duplicate listing not found' }, { status: 404 });
    }

    const otherRecord = other as ListingRecord;
    // Per spec: keep whichever record was more recently updated, mark the other irrelevant.
    // Neither record's favorited/notes/irrelevant needs copying — the survivor already
    // has its own values; we only need to correctly identify which one loses.
    const currentIsNewer = new Date(currentRecord.updated_at) >= new Date(otherRecord.updated_at);
    const loserId = currentIsNewer ? otherRecord.id : currentRecord.id;

    // The duplicate-flag pointer always lives on the requested record; clear it either way.
    await supabase.from('listings').update({ possible_duplicate_of: null }).eq('id', id);

    const { data, error } = await supabase
      .from('listings')
      .update({ irrelevant: true })
      .eq('id', loserId)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ hidden: data });
  }

  return NextResponse.json({ error: 'action must be "merge" or "dismiss"' }, { status: 400 });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "src/app/api/listings/[id]/duplicate/route.test.ts"`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/listings/[id]/duplicate/"
git commit -m "Add possible-duplicate merge/dismiss API"
```

---

### Task 16: Quick-add server action

**Files:**
- Create: `src/app/actions/quickAddListing.ts`
- Test: `src/app/actions/quickAddListing.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/supabase/server', () => ({ getServiceClient: vi.fn() }));
vi.mock('../../lib/extraction/extractListing', () => ({ extractListing: vi.fn() }));
vi.mock('../../lib/dedup/findPossibleDuplicate', () => ({ findPossibleDuplicate: vi.fn() }));

import { getServiceClient } from '../../lib/supabase/server';
import { extractListing } from '../../lib/extraction/extractListing';
import { findPossibleDuplicate } from '../../lib/dedup/findPossibleDuplicate';
import { createFakeSupabase } from '../../lib/supabase/testUtils';
import { quickAddListing } from './quickAddListing';

beforeEach(() => {
  vi.mocked(extractListing).mockResolvedValue({
    title: 'Paste-added listing', price: 4500, rooms: 2, area: 'Center', move_in_date: null,
  });
  vi.mocked(findPossibleDuplicate).mockResolvedValue(null);
});

describe('quickAddListing', () => {
  it('extracts, dedups, and inserts a manual listing directly (no HTTP round-trip)', async () => {
    const fake = createFakeSupabase({ listings: { data: { id: 'new-id' }, error: null } });
    vi.mocked(getServiceClient).mockReturnValue(fake as any);

    const result = await quickAddListing('some pasted facebook post text');

    expect(result.listing).toEqual({ id: 'new-id' });
    expect(fake.builders.listings.insert).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'manual', title: 'Paste-added listing' })
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/actions/quickAddListing.test.ts`
Expected: FAIL — module doesn't exist yet.

- [ ] **Step 3: Write the implementation**

```ts
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
```

This reuses the same `extractListing`/`findPossibleDuplicate` logic as the Ingest API but runs in-process as a Server Action — no `INGEST_API_KEY` needed since it's never exposed to the browser as an HTTP endpoint.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/actions/quickAddListing.test.ts`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add src/app/actions/
git commit -m "Add quick-add server action for manual paste ingestion"
```

---

### Task 17: Dashboard UI — feed, filters, tags, quick-add

**Files:**
- Modify: `src/app/page.tsx`
- Create: `src/components/ListingCard.tsx`
- Create: `src/components/ListingFeed.tsx`
- Create: `src/components/FilterRuleBuilder.tsx`
- Create: `src/components/TagManager.tsx`
- Create: `src/components/QuickAddBox.tsx`
- Create: `src/components/DuplicateBanner.tsx`

This task is UI-heavy. **Per project convention (global CLAUDE.md), invoke the `frontend-design` skill and the `ui-ux-pro-max` MCP tools before writing these components** — the code below is a functional baseline (correct data flow, correct API calls) but the actual visual design/polish should go through that tooling rather than shipping the bare-bones markup as-is.

- [ ] **Step 1: Invoke design tooling**

Before writing component code, invoke the `frontend-design` skill and check `ui-ux-pro-max` MCP tools for this dashboard's layout (feed list, filter panel, tag chips, quick-add form). Use their output to inform the actual JSX/styling — treat the structure below as the functional contract (props, API calls, state), not the final visual design.

- [ ] **Step 2: `ListingCard` component**

Create `src/components/ListingCard.tsx` — functional baseline:

```tsx
'use client';

import { useState } from 'react';
import type { Listing } from '../types/listing';

interface Props {
  listing: Listing;
  onUpdate: (id: string, patch: Partial<Pick<Listing, 'favorited' | 'irrelevant' | 'notes'>>) => void;
  onDuplicateAction: (id: string, action: 'merge' | 'dismiss') => void;
}

export function ListingCard({ listing, onUpdate, onDuplicateAction }: Props) {
  const [notes, setNotes] = useState(listing.notes ?? '');

  return (
    <div className="border rounded p-4 space-y-2">
      <div className="flex justify-between items-start">
        <div>
          <h3 className="font-semibold">{listing.title ?? 'Untitled listing'}</h3>
          <p className="text-sm text-gray-500">
            {listing.source} · {listing.price ?? '?'} · {listing.rooms ?? '?'} rooms · {listing.area ?? 'unknown area'}
          </p>
        </div>
        {listing.delisted_at && <span className="text-xs bg-gray-200 rounded px-2 py-1">Delisted</span>}
      </div>

      {listing.possible_duplicate_of && (
        <div className="bg-yellow-50 border border-yellow-300 rounded p-2 text-sm flex justify-between items-center">
          <span>Possible duplicate — confirm?</span>
          <div className="space-x-2">
            <button onClick={() => onDuplicateAction(listing.id, 'merge')}>Merge</button>
            <button onClick={() => onDuplicateAction(listing.id, 'dismiss')}>Dismiss</button>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <button
          className={listing.favorited ? 'font-bold' : ''}
          onClick={() => onUpdate(listing.id, { favorited: !listing.favorited })}
        >
          {listing.favorited ? 'Favorited' : 'Favorite'}
        </button>
        <button onClick={() => onUpdate(listing.id, { irrelevant: !listing.irrelevant })}>
          {listing.irrelevant ? 'Marked irrelevant' : 'Mark irrelevant'}
        </button>
      </div>

      <textarea
        className="w-full border rounded p-2 text-sm"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={() => onUpdate(listing.id, { notes })}
        placeholder="Shared notes..."
      />
    </div>
  );
}
```

- [ ] **Step 3: `ListingFeed` component**

Create `src/components/ListingFeed.tsx`:

```tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import type { Listing } from '../types/listing';
import { ListingCard } from './ListingCard';

export function ListingFeed() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [showDelisted, setShowDelisted] = useState(false);

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/listings${showDelisted ? '?show_delisted=true' : ''}`);
    const body = await response.json();
    setListings(body.listings ?? []);
  }, [showDelisted]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleUpdate(id: string, patch: Partial<Listing>) {
    await fetch(`/api/listings/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
    refresh();
  }

  async function handleDuplicateAction(id: string, action: 'merge' | 'dismiss') {
    await fetch(`/api/listings/${id}/duplicate`, { method: 'POST', body: JSON.stringify({ action }) });
    refresh();
  }

  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={showDelisted} onChange={(e) => setShowDelisted(e.target.checked)} />
        Show delisted too
      </label>
      {listings.map((listing) => (
        <ListingCard key={listing.id} listing={listing} onUpdate={handleUpdate} onDuplicateAction={handleDuplicateAction} />
      ))}
    </div>
  );
}
```

- [ ] **Step 4: `FilterRuleBuilder` component**

**Known functional gap in this baseline:** `buildFilterString` (Task 8) supports OR-ing across different `rule_group`s, but the component below always submits `rule_group: 0` for every rule — there's no UI control to start a second group. As shipped, every rule ends up ANDed together in one group; the OR-across-groups half of the data model is unreachable from the UI. Either add a "new group" control during the `frontend-design` pass in Step 1, or explicitly treat OR-groups as a fast-follow rather than part of this MVP pass — don't let it slip through unnoticed.

Create `src/components/FilterRuleBuilder.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import type { FilterRule, RuleField, RuleOperator } from '../types/listing';

const FIELDS: RuleField[] = ['price', 'rooms', 'area', 'move_in_date'];
const OPERATORS: RuleOperator[] = ['eq', 'lt', 'lte', 'gt', 'gte', 'in'];

export function FilterRuleBuilder() {
  const [rules, setRules] = useState<FilterRule[]>([]);
  const [field, setField] = useState<RuleField>('price');
  const [operator, setOperator] = useState<RuleOperator>('lt');
  const [value, setValue] = useState('');

  async function refresh() {
    const response = await fetch('/api/filter-rules');
    const body = await response.json();
    setRules(body.rules ?? []);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function addRule() {
    await fetch('/api/filter-rules', {
      method: 'POST',
      body: JSON.stringify({ field, operator, value, rule_group: 0 }),
    });
    setValue('');
    refresh();
  }

  async function removeRule(id: string) {
    await fetch(`/api/filter-rules?id=${id}`, { method: 'DELETE' });
    refresh();
  }

  return (
    <div className="space-y-2">
      <h2 className="font-semibold">Filter rules</h2>
      <ul>
        {rules.map((rule) => (
          <li key={rule.id} className="flex justify-between text-sm">
            {rule.field} {rule.operator} {rule.value}
            <button onClick={() => removeRule(rule.id)}>Remove</button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <select value={field} onChange={(e) => setField(e.target.value as RuleField)}>
          {FIELDS.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        <select value={operator} onChange={(e) => setOperator(e.target.value as RuleOperator)}>
          {OPERATORS.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="value" />
        <button onClick={addRule}>Add rule</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: `TagManager` component**

Create `src/components/TagManager.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import type { Tag } from '../types/listing';

export function TagManager() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [label, setLabel] = useState('');

  async function refresh() {
    const response = await fetch('/api/tags');
    const body = await response.json();
    setTags(body.tags ?? []);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function addTag() {
    await fetch('/api/tags', { method: 'POST', body: JSON.stringify({ label }) });
    setLabel('');
    refresh();
  }

  async function removeTag(id: string) {
    await fetch(`/api/tags?id=${id}`, { method: 'DELETE' });
    refresh();
  }

  return (
    <div className="space-y-2">
      <h2 className="font-semibold">Tags</h2>
      <div className="flex gap-2 flex-wrap">
        {tags.map((tag) => (
          <span key={tag.id} className="border rounded px-2 py-1 text-sm">
            {tag.label} <button onClick={() => removeTag(tag.id)}>×</button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder='e.g. "pet friendly"' />
        <button onClick={addTag}>Add tag</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: `QuickAddBox` component**

Create `src/components/QuickAddBox.tsx`:

```tsx
'use client';

import { useState, useTransition } from 'react';
import { quickAddListing } from '../app/actions/quickAddListing';

export function QuickAddBox({ onAdded }: { onAdded?: () => void }) {
  const [text, setText] = useState('');
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    startTransition(async () => {
      await quickAddListing(text);
      setText('');
      onAdded?.();
    });
  }

  return (
    <div className="space-y-2">
      <h2 className="font-semibold">Quick add (paste from Facebook, WhatsApp, anywhere)</h2>
      <textarea
        className="w-full border rounded p-2"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste listing text here..."
      />
      <button onClick={handleSubmit} disabled={isPending || !text.trim()}>
        {isPending ? 'Adding...' : 'Add listing'}
      </button>
    </div>
  );
}
```

- [ ] **Step 7: Wire up the dashboard page**

Modify `src/app/page.tsx`:

```tsx
import { ListingFeed } from '../components/ListingFeed';
import { FilterRuleBuilder } from '../components/FilterRuleBuilder';
import { TagManager } from '../components/TagManager';
import { QuickAddBox } from '../components/QuickAddBox';

export default function Home() {
  return (
    <main className="max-w-3xl mx-auto p-6 space-y-8">
      <h1 className="text-2xl font-bold">Rental Dashboard</h1>
      <FilterRuleBuilder />
      <TagManager />
      <QuickAddBox />
      <ListingFeed />
    </main>
  );
}
```

- [ ] **Step 8: Manual smoke check**

Run: `npm run dev`, open `http://localhost:3000`. Confirm the page renders without console errors (data will be empty until Supabase is connected in Task 20 — that's expected at this point).

- [ ] **Step 9: Commit**

```bash
git add src/app/page.tsx src/components/
git commit -m "Add dashboard UI: feed, filter rules, tags, quick-add, duplicate banner"
```

---

### Task 18: Yad2 scraper script

**Files:**
- Create: `scripts/scrape-yad2.ts`

**⚠️ Blocked on real data:** the DOM selectors below (`[data-testid="feed-item"]` etc.) are **placeholders** — Yad2's actual markup hasn't been inspected. Step 1 requires the real search URL and live inspection before this script can actually work.

- [ ] **Step 1: Inspect the real Yad2 search page**

Once the user provides their Yad2 search URL (see Prerequisites), open it in a browser, use devtools to inspect a listing card, and note the real selectors/attributes for: card container, detail link (for `source_ref`), price, room count, area/neighborhood, title. Replace every `[data-testid="..."]` selector below with the real ones found.

- [ ] **Step 2: Write the script**

Create `scripts/scrape-yad2.ts`:

```ts
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

    // PLACEHOLDER SELECTORS — replace with real ones found in Step 1.
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
```

- [ ] **Step 3: Manual dry run (requires real Supabase project + Yad2 URL from Prerequisites)**

Run: `SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... YAD2_SEARCH_URL=... npx tsx scripts/scrape-yad2.ts`
Expected: logs `Scraped N listings from Yad2`, and rows appear in the Supabase `listings` table with `source = 'yad2'`.

- [ ] **Step 4: Commit**

```bash
git add scripts/
git commit -m "Add Yad2 scraper with delisting detection"
```

---

### Task 19: GitHub Actions workflow

**Files:**
- Create: `.github/workflows/scrape-yad2.yml`
- Modify: `package.json`

- [ ] **Step 1: Add `tsx` as a runnable dependency (already installed in Task 1) and confirm it runs the script directly**

Run: `npx tsx scripts/scrape-yad2.ts --help 2>&1 | head -1` (just confirming `tsx` can load the file; real run needs env vars from Task 18 Step 3).

- [ ] **Step 2: Write the workflow**

Create `.github/workflows/scrape-yad2.yml`:

```yaml
name: Scrape Yad2

on:
  schedule:
    - cron: '0 * * * *'
  workflow_dispatch: {}

jobs:
  scrape:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npx tsx scripts/scrape-yad2.ts
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          YAD2_SEARCH_URL: ${{ secrets.YAD2_SEARCH_URL }}
```

Runs hourly (`0 * * * *`); adjust the cron expression if a different frequency is wanted. `workflow_dispatch` allows triggering it manually from the GitHub Actions tab for testing.

- [ ] **Step 3: Commit**

```bash
git add .github/
git commit -m "Add GitHub Actions cron workflow for Yad2 scraper"
```

(This workflow won't actually run successfully until the repo exists on GitHub with the three secrets configured — see Task 20.)

---

### Task 20: Manual configuration checklist

This task has no code — it's the exact sequence of external account/config steps needed before anything is actually live. Present this checklist to the user; each step needs their action (account creation, OAuth linking) that can't be done on their behalf.

- [ ] **Step 1: Supabase project**
  - Create a free-tier project at supabase.com.
  - In the SQL editor, run the contents of `supabase/schema.sql`.
  - Copy the Project URL, `anon` public key, and `service_role` secret key from Project Settings → API.

- [ ] **Step 2: GitHub repo**
  - Confirm public or private, then: `gh repo create <name> --private --source=. --push` (or push manually to an existing empty repo).
  - In the repo's Settings → Secrets and variables → Actions, add: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `YAD2_SEARCH_URL`.

- [ ] **Step 3: Vercel project**
  - Log into vercel.com, import the GitHub repo.
  - Add environment variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `INGEST_API_KEY` (generate any random secret string for this one), `NEXT_PUBLIC_APP_URL` (the deployed Vercel URL, used by the tags-CRUD route's sweep call).
  - Deploy.

- [ ] **Step 4: Supabase Database Webhook (for tag-matching on every insert)**
  - In the Supabase dashboard: Database → Webhooks → Create a new webhook.
  - Table: `listings`. Event: `INSERT`. Type: HTTP Request. Method: `POST`.
  - URL: `https://<your-vercel-app>/api/tags/check`.
  - HTTP headers: `Authorization: Bearer <the same INGEST_API_KEY value used in Vercel>`.

- [ ] **Step 5: Confirm secrets match everywhere**
  - `INGEST_API_KEY` must be identical in: Vercel env vars, and the Supabase webhook header. It is *not* needed in GitHub Actions secrets (the Yad2 workflow writes to Supabase directly via the service-role key, never calling the app's API).

---

### Task 21: End-to-end smoke test

**Files:** none — verification only.

- [ ] **Step 1: Trigger the Yad2 workflow manually**

In GitHub → Actions → "Scrape Yad2" → Run workflow. Confirm it completes and the Supabase `listings` table has new `source = 'yad2'` rows.

- [ ] **Step 2: Confirm the tag webhook fires**

Add a tag via the deployed dashboard's Tag Manager (e.g. "pet friendly"). Confirm `listing_tags` rows appear for existing listings within a few seconds (check the Supabase table editor).

- [ ] **Step 3: Confirm the dashboard feed reflects filters**

Add a filter rule (e.g. `rooms gte 2`) via the Filter Rule Builder. Confirm the feed narrows accordingly.

- [ ] **Step 4: Confirm quick-add works**

Paste a fake listing's text into the Quick Add box. Confirm a new row appears with `source = 'manual'` and reasonable extracted fields.

- [ ] **Step 5: Confirm favorite/irrelevant/notes persist**

Toggle favorite and irrelevant on a listing, add a note, reload the page. Confirm the state persisted (it's shared/global, so no per-user check needed).

---

## What's Deliberately Not Here

Per the spec's phasing, this plan covers **MVP only**. WhatsApp on-demand ingestion (Phase 2) and Facebook on-demand ingestion (Phase 3) are separate, independent subsystems (computer-use automation and browser automation respectively) and should each get their own plan once this MVP is live and the real Yad2/Supabase/GitHub/Vercel details are filled in.
