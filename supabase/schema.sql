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
