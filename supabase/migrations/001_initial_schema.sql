-- Interactive KP Light - Database Schema
-- Run this in Supabase SQL Editor

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Clients table
create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  address text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- KP master table
create table if not exists kps (
  id uuid primary key default gen_random_uuid(),
  number text unique not null,
  client_id uuid references clients(id) on delete set null,
  client_name text not null,
  client_phone text,
  project_name text not null,
  created_at timestamptz default now(),
  valid_until date,
  status text default 'draft' check (status in ('draft', 'sent', 'viewed', 'confirmed', 'expired')),
  notes text,
  advance_percent int default 0 check (advance_percent between 0 and 100),
  balance_condition text,
  discount_type text default 'none' check (discount_type in ('none', 'percent', 'fixed')),
  discount_value numeric default 0,
  public_token uuid unique default gen_random_uuid(),
  confirmed_at timestamptz,
  selected_total numeric
);

-- KP items table
create table if not exists kp_items (
  id uuid primary key default gen_random_uuid(),
  kp_id uuid references kps(id) on delete cascade not null,
  name text not null,
  description text,
  dimensions text,
  quantity int default 1,
  image_url text,
  sort_order int default 0
);

-- KP item variants table
create table if not exists kp_item_variants (
  id uuid primary key default gen_random_uuid(),
  item_id uuid references kp_items(id) on delete cascade not null,
  name text not null,
  material text,
  hardware text,
  description text,
  price numeric not null,
  is_default boolean default false
);

-- KP confirmations table
create table if not exists kp_confirmations (
  id uuid primary key default gen_random_uuid(),
  kp_id uuid references kps(id) on delete cascade not null,
  client_name text,
  client_phone text,
  comment text,
  selected_variants jsonb not null,
  selected_total numeric not null,
  confirmed_at timestamptz default now()
);

-- KP counters for auto-numbering
create table if not exists kp_counters (
  year int primary key,
  last_number int default 0
);

-- Auto-update updated_at for clients
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger update_clients_updated_at
  before update on clients
  for each row
  execute function update_updated_at_column();

-- Row Level Security
alter table clients enable row level security;
alter table kps enable row level security;
alter table kp_items enable row level security;
alter table kp_item_variants enable row level security;
alter table kp_confirmations enable row level security;
alter table kp_counters enable row level security;

-- Policies: owner can do everything, public can only read kps and items via public_token
create policy "Owner full access on clients"
  on clients for all
  using (auth.uid() is not null);

create policy "Owner full access on kps"
  on kps for all
  using (auth.uid() is not null);

create policy "Owner full access on kp_items"
  on kp_items for all
  using (auth.uid() is not null);

create policy "Owner full access on kp_item_variants"
  on kp_item_variants for all
  using (auth.uid() is not null);

create policy "Owner full access on kp_confirmations"
  on kp_confirmations for all
  using (auth.uid() is not null);

create policy "Owner full access on kp_counters"
  on kp_counters for all
  using (auth.uid() is not null);

-- Public access policies for client view
create policy "Public read access to confirmed/sent/viewed kps"
  on kps for select
  using (status in ('sent', 'viewed', 'confirmed'));

create policy "Public read access to kp_items"
  on kp_items for select
  using (true);

create policy "Public read access to kp_item_variants"
  on kp_item_variants for select
  using (true);

create policy "Public insert on kp_confirmations"
  on kp_confirmations for insert
  with check (true);

create policy "Public update status to viewed"
  on kps for update
  using (true)
  with check (true);

-- Function to get next KP number
create or replace function get_next_kp_number()
returns text as $$
declare
  current_year int := extract(year from now());
  next_number int;
  result text;
begin
  -- Lock the row for update
  insert into kp_counters (year, last_number)
  values (current_year, 1)
  on conflict (year) do update
  set last_number = kp_counters.last_number + 1
  returning last_number into next_number;

  result := 'КП-' || current_year || '-' || lpad(next_number::text, 3, '0');
  return result;
end;
$$ language plpgsql;
