-- Attillion: accounts you can use on any device.
-- Paste all of this into Supabase > SQL Editor > New query, then press Run. Safe to run more than once.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  login_email text not null,
  elo integer not null default 1000,
  peak integer not null default 1000,
  avatar text,
  wins integer not null default 0,
  losses integer not null default 0,
  today_key text,
  today_score integer,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint profiles_name_ok check (
    name ~ '^[A-Za-z0-9_-]{2,20}$'
    and (lower(name) not like 'admin%' or lower(name) = 'adminatticus')
  )
);

create unique index if not exists profiles_name_lower on public.profiles (lower(name));
create index if not exists profiles_elo on public.profiles (elo desc);
create index if not exists profiles_today on public.profiles (today_key, today_score desc);

alter table public.profiles enable row level security;

drop policy if exists "Anyone can read profiles" on public.profiles;
create policy "Anyone can read profiles" on public.profiles
  for select to anon, authenticated using (true);

drop policy if exists "Players create their own profile" on public.profiles;
create policy "Players create their own profile" on public.profiles
  for insert to authenticated with check ((select auth.uid()) = id);

drop policy if exists "Players update their own profile" on public.profiles;
create policy "Players update their own profile" on public.profiles
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

grant select on public.profiles to anon, authenticated;
grant insert, update on public.profiles to authenticated;
