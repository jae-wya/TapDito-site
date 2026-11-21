-- TapDito Order: database setup.
-- Paste this whole file into Supabase > SQL Editor > New query, then click Run. Run it once.
--
-- DEMO SECURITY LEVEL: guests can place orders and reviews; the staff and owner screens
-- read with the public key. Good enough for the demo. Before Bonitos goes live we add a
-- staff/owner login so only they can read orders and reviews.

create table if not exists public.servers (
  id uuid primary key default gen_random_uuid(),
  restaurant text not null,
  name text not null,
  photo text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  number bigint generated always as identity,
  restaurant text not null,
  table_no text not null check (char_length(table_no) between 1 and 6),
  items jsonb not null,
  note text not null default '' check (char_length(note) <= 200),
  total numeric not null default 0,
  status text not null default 'new' check (status in ('new','preparing','served','cancelled')),
  created_at timestamptz not null default now()
);
create index if not exists orders_rest_time on public.orders (restaurant, created_at desc);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  restaurant text not null,
  table_no text not null default '',
  server_id uuid references public.servers(id),
  server_name text not null default '',
  rating int not null check (rating between 1 and 5),
  comment text not null default '' check (char_length(comment) <= 300),
  suggestion text not null default '' check (char_length(suggestion) <= 300),
  created_at timestamptz not null default now()
);
create index if not exists reviews_rest_time on public.reviews (restaurant, created_at desc);

alter table public.servers enable row level security;
alter table public.orders  enable row level security;
alter table public.reviews enable row level security;

-- Anyone can see the active server list (names shown on the review screen).
drop policy if exists "read servers" on public.servers;
create policy "read servers" on public.servers for select using (active);

-- Guests can place new orders only (status must start as 'new').
drop policy if exists "guest order" on public.orders;
create policy "guest order" on public.orders for insert with check (status = 'new');

-- DEMO: staff screen reads and updates order status with the public key.
drop policy if exists "demo read orders" on public.orders;
create policy "demo read orders" on public.orders for select using (true);
drop policy if exists "demo update orders" on public.orders;
create policy "demo update orders" on public.orders for update using (true) with check (status in ('new','preparing','served','cancelled'));

-- Guests can leave reviews.
drop policy if exists "guest review" on public.reviews;
create policy "guest review" on public.reviews for insert with check (rating between 1 and 5);

-- DEMO: owner dashboard reads reviews with the public key.
drop policy if exists "demo read reviews" on public.reviews;
create policy "demo read reviews" on public.reviews for select using (true);

-- Live updates for the staff screen and dashboard.
do $$ begin
  begin alter publication supabase_realtime add table public.orders; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.reviews; exception when duplicate_object then null; end;
end $$;

-- Reservations from the booking page.
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  restaurant text not null,
  name text not null check (char_length(name) between 1 and 60),
  phone text not null check (char_length(phone) between 10 and 16),
  date date not null,
  time time not null,
  pax int not null check (pax between 1 and 40),
  note text not null default '' check (char_length(note) <= 200),
  status text not null default 'pending' check (status in ('pending','confirmed','declined')),
  created_at timestamptz not null default now()
);
create index if not exists bookings_rest_date on public.bookings (restaurant, date, time);
alter table public.bookings enable row level security;
drop policy if exists "guest book" on public.bookings;
create policy "guest book" on public.bookings for insert with check (status = 'pending' and date >= current_date);
-- DEMO: staff screen reads and confirms bookings with the public key. Replace with staff login before go-live,
-- because bookings hold guests' names and phone numbers.
drop policy if exists "demo read bookings" on public.bookings;
create policy "demo read bookings" on public.bookings for select using (true);
drop policy if exists "demo update bookings" on public.bookings;
create policy "demo update bookings" on public.bookings for update using (true) with check (status in ('pending','confirmed','declined'));
do $$ begin
  begin alter publication supabase_realtime add table public.bookings; exception when duplicate_object then null; end;
end $$;

-- Sample servers for the Bonitos demo (swap for real names later).
insert into public.servers (restaurant, name)
select 'bonitos', n from unnest(array['Ana','Ben','Carlo','Dina','Eli']) as n
where not exists (select 1 from public.servers where restaurant = 'bonitos');
