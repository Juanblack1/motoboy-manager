create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text not null unique,
  role text not null check (role in ('admin', 'courier')),
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

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  public_code text not null unique,
  customer_name text not null,
  customer_phone text not null,
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
create index if not exists orders_public_code_idx on public.orders(public_code);
create index if not exists delivery_events_order_id_idx on public.delivery_events(order_id);

alter table public.profiles enable row level security;
alter table public.couriers enable row level security;
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
using (public.is_admin() or profile_id = auth.uid());

drop policy if exists "couriers admin manage" on public.couriers;
create policy "couriers admin manage" on public.couriers
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "orders read admin or assigned" on public.orders;
create policy "orders read admin or assigned" on public.orders
for select to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.couriers c
    where c.id = assigned_courier_id and c.profile_id = auth.uid()
  )
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
  exists (
    select 1 from public.couriers c
    where c.id = assigned_courier_id and c.profile_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.couriers c
    where c.id = assigned_courier_id and c.profile_id = auth.uid()
  )
);

drop policy if exists "events read visible orders" on public.delivery_events;
create policy "events read visible orders" on public.delivery_events
for select to authenticated
using (public.is_admin() or public.is_assigned_courier(order_id));

drop policy if exists "events insert authenticated" on public.delivery_events;
create policy "events insert authenticated" on public.delivery_events
for insert to authenticated
with check (public.is_admin() or public.is_assigned_courier(order_id));

drop policy if exists "locations read admin or self" on public.courier_locations;
create policy "locations read admin or self" on public.courier_locations
for select to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.couriers c
    where c.id = courier_id and c.profile_id = auth.uid()
  )
);

drop policy if exists "locations courier upsert self" on public.courier_locations;
create policy "locations courier upsert self" on public.courier_locations
for insert to authenticated
with check (
  exists (
    select 1 from public.couriers c
    where c.id = courier_id and c.profile_id = auth.uid()
  )
);

drop policy if exists "locations courier update self" on public.courier_locations;
create policy "locations courier update self" on public.courier_locations
for update to authenticated
using (
  exists (
    select 1 from public.couriers c
    where c.id = courier_id and c.profile_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.couriers c
    where c.id = courier_id and c.profile_id = auth.uid()
  )
);

create or replace function public.get_public_tracking(p_code text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'order', jsonb_build_object(
      'id', o.id,
      'number', o.number,
      'public_code', o.public_code,
      'customer_name', o.customer_name,
      'customer_phone', '',
      'merchant_name', o.merchant_name,
      'pickup_address', o.pickup_address,
      'destination_address', o.destination_address,
      'pickup_lat', o.pickup_lat,
      'pickup_lng', o.pickup_lng,
      'destination_lat', o.destination_lat,
      'destination_lng', o.destination_lng,
      'status', o.status,
      'assigned_courier_id', o.assigned_courier_id,
      'total_cents', o.total_cents,
      'created_at', o.created_at,
      'promised_at', o.promised_at,
      'eta_minutes', o.eta_minutes,
      'distance_km', o.distance_km,
      'items', o.items
    ),
    'courier', case when c.id is null then null else jsonb_build_object(
      'id', c.id,
      'profile_id', c.profile_id,
      'name', c.name,
      'phone', '',
      'vehicle', c.vehicle,
      'plate', c.plate,
      'rating', c.rating,
      'status', c.status
    ) end,
    'location', case when l.courier_id is null then null else to_jsonb(l) end
  )
  from public.orders o
  left join public.couriers c on c.id = o.assigned_courier_id
  left join public.courier_locations l on l.order_id = o.id
  where lower(o.public_code) = lower(p_code)
  limit 1;
$$;

grant execute on function public.get_public_tracking(text) to anon, authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_assigned_courier(uuid) to authenticated;

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
