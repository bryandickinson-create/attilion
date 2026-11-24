-- Attillion: friends and messages.
-- Paste all of this into Supabase > SQL Editor > New query, then press Run. Safe to run more than once.
-- Only the two players in a friendship can see it, and only friends can message each other.

create table if not exists public.friendships (
  id bigint generated always as identity primary key,
  requester uuid not null references public.profiles(id) on delete cascade,
  addressee uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  constraint friendships_not_self check (requester <> addressee)
);
create unique index if not exists friendships_pair on public.friendships (least(requester, addressee), greatest(requester, addressee));

alter table public.friendships enable row level security;

drop policy if exists "See my friendships" on public.friendships;
create policy "See my friendships" on public.friendships
  for select to authenticated using ((select auth.uid()) in (requester, addressee));

drop policy if exists "Send a friend request" on public.friendships;
create policy "Send a friend request" on public.friendships
  for insert to authenticated with check ((select auth.uid()) = requester and status = 'pending');

drop policy if exists "Accept a friend request" on public.friendships;
create policy "Accept a friend request" on public.friendships
  for update to authenticated using ((select auth.uid()) = addressee) with check ((select auth.uid()) = addressee and status = 'accepted');

drop policy if exists "Remove a friend or request" on public.friendships;
create policy "Remove a friend or request" on public.friendships
  for delete to authenticated using ((select auth.uid()) in (requester, addressee));

grant select, insert, update, delete on public.friendships to authenticated;

create table if not exists public.messages (
  id bigint generated always as identity primary key,
  sender uuid not null references public.profiles(id) on delete cascade,
  recipient uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 300),
  created_at timestamptz not null default now()
);
create index if not exists messages_pair on public.messages (least(sender, recipient), greatest(sender, recipient), created_at desc);
create index if not exists messages_recipient on public.messages (recipient, created_at desc);

alter table public.messages enable row level security;

drop policy if exists "See my messages" on public.messages;
create policy "See my messages" on public.messages
  for select to authenticated using ((select auth.uid()) in (sender, recipient));

drop policy if exists "Message my friends" on public.messages;
create policy "Message my friends" on public.messages
  for insert to authenticated with check (
    (select auth.uid()) = sender
    and exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and ((f.requester = sender and f.addressee = recipient) or (f.requester = recipient and f.addressee = sender))
    )
  );

grant select, insert on public.messages to authenticated;
