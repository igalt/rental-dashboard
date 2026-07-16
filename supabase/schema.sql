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

-- A plain (non-partial) unique constraint, not just an index: Postgres's standard uniqueness
-- semantics already treat NULL as distinct from every other NULL, so multiple manual/facebook/
-- whatsapp rows with source_ref = null never conflict with each other on their own. A partial
-- index (`where source_ref is not null`) looks equivalent but can't be targeted by an
-- `ON CONFLICT (source, source_ref)` clause — Postgres requires a real constraint (or an index
-- whose predicate matches the ON CONFLICT clause's own WHERE, which supabase-js's .upsert()
-- does not add) — so upserts against it fail with "no unique or exclusion constraint matching
-- the ON CONFLICT specification" (42P10). A genuine constraint has no such restriction.
alter table listings add constraint listings_source_ref_unique unique (source, source_ref);

alter table listings add column image_url text;
-- true = site confirms a safe room (ממ"ד/מקלט) is present, false = site confirms one is
-- explicitly absent, null = not stated (most listings don't expose this field at all).
alter table listings add column safe_room boolean;
alter table listings add column status text not null default 'new' check (status in ('new', 'contacted', 'seen'));
-- true = site states entry is immediate ("כניסה מידית"). move_in_date holds an actual date
-- when the site states one. Both null when the site just says "flexible" (not real info).
alter table listings add column move_in_immediate boolean;

-- floor/built_sqm come from the feed/detail pages' own labeled fields; condition holds the
-- site's free-text value (e.g. "משופץ") rather than a boolean, since it's more informative
-- than a single renovated/not flag. balcony/storage/furnished follow the same true/false/null
-- convention as safe_room: null means the site doesn't show that amenity section at all.
alter table listings add column floor text;
alter table listings add column built_sqm numeric;
alter table listings add column condition text;
alter table listings add column balcony boolean;
alter table listings add column storage boolean;
alter table listings add column furnished boolean;

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
