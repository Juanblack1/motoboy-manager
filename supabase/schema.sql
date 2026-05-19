create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text not null unique,
  role text not null check (role in ('admin', 'courier', 'client')),
  created_at timestamptz not null default now()
);

create table if not exists public.couriers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  phone text not null,
  vehicle text not null,
  plate text not null,
  rating numeric(3,2) not null default 5,
  status text not null default 'offline' check (status in ('available', 'busy', 'offline')),
  created_at timestamptz not null default now()
);

create table if not exists public.shops (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text not null,
  contact_name text not null,
  phone text not null,
  lat double precision not null,
  lng double precision not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  public_code text not null unique,
  customer_name text not null,
  customer_phone text not null,
  client_profile_id uuid references public.profiles(id) on delete set null,
  merchant_name text not null,
  pickup_address text not null,
  destination_address text not null,
  pickup_lat double precision not null,
  pickup_lng double precision not null,
  destination_lat double precision not null,
  destination_lng double precision not null,
  status text not null default 'queued' check (status in ('queued', 'assigned', 'pickup', 'in_transit', 'delivered', 'delayed', 'cancelled')),
  assigned_courier_id uuid references public.couriers(id) on delete set null,
  total_cents integer not null default 0,
  eta_minutes integer not null default 0,
  distance_km numeric(8,2) not null default 0,
  items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  promised_at timestamptz not null default now() + interval '45 minutes'
);

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('admin', 'courier', 'client'));
alter table public.orders add column if not exists client_profile_id uuid references public.profiles(id) on delete set null;

create table if not exists public.delivery_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  actor_name text not null,
  status text not null check (status in ('queued', 'assigned', 'pickup', 'in_transit', 'delivered', 'delayed', 'cancelled')),
  message text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.courier_locations (
  courier_id uuid primary key references public.couriers(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  lat double precision not null,
  lng double precision not null,
  accuracy double precision,
  speed double precision,
  heading double precision,
  battery double precision,
  recorded_at timestamptz not null default now()
);

create index if not exists orders_assigned_courier_id_idx on public.orders(assigned_courier_id);
create index if not exists orders_client_profile_id_idx on public.orders(client_profile_id);
create index if not exists orders_public_code_idx on public.orders(public_code);
create index if not exists shops_active_idx on public.shops(active);
create index if not exists delivery_events_order_id_idx on public.delivery_events(order_id);

alter table public.profiles enable row level security;
alter table public.couriers enable row level security;
alter table public.shops enable row level security;
alter table public.orders enable row level security;
alter table public.delivery_events enable row level security;
alter table public.courier_locations enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.is_assigned_courier(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.orders o
    join public.couriers c on c.id = o.assigned_courier_id
    where o.id = p_order_id and c.profile_id = auth.uid()
  );
$$;

create or replace function public.is_courier_for(p_courier_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.couriers c
    where c.id = p_courier_id and c.profile_id = auth.uid()
  );
$$;

create or replace function public.is_order_client(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.orders o
    where o.id = p_order_id and o.client_profile_id = auth.uid()
  );
$$;

create or replace function public.client_can_read_courier(p_courier_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.orders o
    where o.assigned_courier_id = p_courier_id and o.client_profile_id = auth.uid()
  );
$$;

drop policy if exists "profiles read own or admin" on public.profiles;
create policy "profiles read own or admin" on public.profiles
for select to authenticated
using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own" on public.profiles
for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists "couriers read admin or self" on public.couriers;
create policy "couriers read admin or self" on public.couriers
for select to authenticated
using (
  public.is_admin()
  or profile_id = auth.uid()
  or public.client_can_read_courier(couriers.id)
);

drop policy if exists "couriers admin manage" on public.couriers;
create policy "couriers admin manage" on public.couriers
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "shops read active or admin" on public.shops;
create policy "shops read active or admin" on public.shops
for select to authenticated
using (active or public.is_admin());

drop policy if exists "shops admin manage" on public.shops;
create policy "shops admin manage" on public.shops
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "orders read admin or assigned" on public.orders;
create policy "orders read admin or assigned" on public.orders
for select to authenticated
using (
  public.is_admin()
  or client_profile_id = auth.uid()
  or public.is_courier_for(assigned_courier_id)
);

drop policy if exists "orders client create own" on public.orders;
create policy "orders client create own" on public.orders
for insert to authenticated
with check (
  client_profile_id = auth.uid()
  and assigned_courier_id is null
  and status = 'queued'
);

drop policy if exists "orders admin manage" on public.orders;
create policy "orders admin manage" on public.orders
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "orders courier update assigned" on public.orders;
create policy "orders courier update assigned" on public.orders
for update to authenticated
using (
  public.is_courier_for(assigned_courier_id)
)
with check (
  public.is_courier_for(assigned_courier_id)
);

drop policy if exists "events read visible orders" on public.delivery_events;
create policy "events read visible orders" on public.delivery_events
for select to authenticated
using (
  public.is_admin()
  or public.is_assigned_courier(order_id)
  or public.is_order_client(order_id)
);

drop policy if exists "events insert authenticated" on public.delivery_events;
create policy "events insert authenticated" on public.delivery_events
for insert to authenticated
with check (public.is_admin() or public.is_assigned_courier(order_id));

drop policy if exists "locations read admin or self" on public.courier_locations;
create policy "locations read admin or self" on public.courier_locations
for select to authenticated
using (
  public.is_admin()
  or public.is_courier_for(courier_id)
  or public.client_can_read_courier(courier_id)
);

drop policy if exists "locations courier upsert self" on public.courier_locations;
create policy "locations courier upsert self" on public.courier_locations
for insert to authenticated
with check (
  public.is_courier_for(courier_id)
);

drop policy if exists "locations courier update self" on public.courier_locations;
create policy "locations courier update self" on public.courier_locations
for update to authenticated
using (
  public.is_courier_for(courier_id)
)
with check (
  public.is_courier_for(courier_id)
);

drop function if exists public.get_public_tracking(text);
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_assigned_courier(uuid) to authenticated;
grant execute on function public.is_courier_for(uuid) to authenticated;
grant execute on function public.is_order_client(uuid) to authenticated;
grant execute on function public.client_can_read_courier(uuid) to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.orders;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.courier_locations;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.delivery_events;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.shops;
exception when duplicate_object then null;
end $$;
