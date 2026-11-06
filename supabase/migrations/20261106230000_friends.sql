-- ============ USERNAMES + FRIENDS ============
-- * Every player gets a username (lowercase letters, numbers, _; 3-20 long). Picked for them
--   at signup from their name; they can change it on their profile. Used for search and the
--   friend link runback.net/add/<username>.
-- * Friends: send a request (from search, a player card, or a friend link), the other player
--   accepts or declines. Either one can remove the friendship any time.
-- * Blocking a player also removes the friendship and any request. Blocked players can't
--   send each other requests and don't show up in each other's search.
-- All friend changes go through functions; players can only read rows they're part of.

-- ---------- usernames ----------
alter table public.profiles add column username text;

-- Turns a name into a free username: "Ray Allen" -> "rayallen", or "rayallen4821" if taken.
create function private.make_username(p_name text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  base text := left(regexp_replace(lower(coalesce(p_name, '')), '[^a-z0-9_]', '', 'g'), 15);
  pick text;
begin
  if char_length(base) < 3 or private.has_banned_word(base) then base := 'player'; end if;
  pick := base;
  while exists (select 1 from public.profiles where username = pick) loop
    pick := base || (1000 + floor(random() * 9000))::int::text;
  end loop;
  return pick;
end $$;
revoke all on function private.make_username(text) from public, anon, authenticated;

-- Existing players: oldest account gets the plain name if two match.
do $$ declare r record; begin
  for r in select id, display_name from public.profiles where username is null order by created_at loop
    update public.profiles set username = private.make_username(r.display_name) where id = r.id;
  end loop;
end $$;

alter table public.profiles
  alter column username set not null,
  add constraint profiles_username_format check (username ~ '^[a-z0-9_]{3,20}$'),
  add constraint profiles_username_key unique (username);

-- New players get one at signup. Same as before, plus the username.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  name text := left(coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'), ''), split_part(new.email, '@', 1), 'Player'), 40);
begin
  insert into public.profiles (id, display_name, username)
  values (new.id, name, private.make_username(name));
  return new;
end;
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Word filter now covers usernames too. Same as before, plus the username check.
create or replace function private.filter_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if private.has_banned_word(new.display_name) then new.display_name := 'Player'; end if;
    if private.has_banned_word(new.bio) then new.bio := null; end if;
    return new;
  end if;
  if new.display_name is distinct from old.display_name and private.has_banned_word(new.display_name) then
    raise exception 'That name has words that aren''t allowed on Runback. Pick another name.';
  end if;
  if new.bio is distinct from old.bio and private.has_banned_word(new.bio) then
    raise exception 'Your bio has words that aren''t allowed on Runback. Edit it and try again.';
  end if;
  if new.username is distinct from old.username and private.has_banned_word(replace(new.username, '_', ' ')) then
    raise exception 'That username has words that aren''t allowed on Runback. Pick another one.';
  end if;
  return new;
end $$;
revoke all on function private.filter_profile() from public, anon, authenticated;
drop trigger filter_profile on public.profiles;
create trigger filter_profile before insert or update of display_name, bio, username on public.profiles
  for each row execute function private.filter_profile();

-- ---------- friendships ----------
create table public.friendships (
  requester_id uuid not null references public.profiles on delete cascade,
  addressee_id uuid not null references public.profiles on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  primary key (requester_id, addressee_id),
  constraint friendships_not_self check (requester_id <> addressee_id)
);
-- Only one row per pair, whichever way it was sent.
create unique index friendships_pair_idx on public.friendships
  (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index friendships_addressee_idx on public.friendships (addressee_id);

alter table public.friendships enable row level security;
create policy friendships_read_own on public.friendships for select to authenticated
  using ((select auth.uid()) in (requester_id, addressee_id));
revoke all on public.friendships from anon, authenticated;
grant select on public.friendships to authenticated;
grant all on public.friendships to service_role;

-- Send a request. If they already asked you, this accepts it instead.
create function public.send_friend_request(p_user_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  existing public.friendships;
begin
  if uid is null then raise exception 'Sign in to add friends'; end if;
  if p_user_id is null or p_user_id = uid then raise exception 'You can''t add yourself'; end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then raise exception 'Player not found'; end if;
  if private.blocked_between(uid, p_user_id) then raise exception 'You can''t add that player'; end if;

  select * into existing from public.friendships
    where (requester_id = uid and addressee_id = p_user_id) or (requester_id = p_user_id and addressee_id = uid);
  if found then
    if existing.status = 'accepted' then return 'friends'; end if;
    if existing.requester_id = uid then return 'sent'; end if;
    update public.friendships set status = 'accepted', accepted_at = now()
      where requester_id = p_user_id and addressee_id = uid;
    return 'friends';
  end if;

  -- No request spam: 30 an hour, and max 100 waiting at once.
  if (select count(*) from public.friendships where requester_id = uid and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'Too many friend requests. Try again later.';
  end if;
  if (select count(*) from public.friendships where requester_id = uid and status = 'pending') >= 100 then
    raise exception 'You have too many requests waiting. Cancel some first.';
  end if;
  if (select count(*) from public.friendships where uid in (requester_id, addressee_id) and status = 'accepted') >= 500 then
    raise exception 'Friend limit reached';
  end if;

  insert into public.friendships (requester_id, addressee_id) values (uid, p_user_id);
  return 'sent';
end $$;
revoke all on function public.send_friend_request(uuid) from public, anon;
grant execute on function public.send_friend_request(uuid) to authenticated;

-- Accept a request someone sent you.
create function public.accept_friend_request(p_user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  update public.friendships set status = 'accepted', accepted_at = now()
    where requester_id = p_user_id and addressee_id = auth.uid() and status = 'pending';
  if not found then raise exception 'That request is gone'; end if;
end $$;
revoke all on function public.accept_friend_request(uuid) from public, anon;
grant execute on function public.accept_friend_request(uuid) to authenticated;

-- Decline, cancel your own request, or unfriend. All the same thing: the row goes away.
create function public.remove_friend(p_user_id uuid) returns void
language sql security definer set search_path = '' as $$
  delete from public.friendships
  where (requester_id = auth.uid() and addressee_id = p_user_id)
     or (requester_id = p_user_id and addressee_id = auth.uid());
$$;
revoke all on function public.remove_friend(uuid) from public, anon;
grant execute on function public.remove_friend(uuid) to authenticated;

-- Your friends and requests, with the other player's info.
-- state: 'friends', 'incoming' (they asked you), 'outgoing' (you asked them).
create function public.my_friends()
returns table (id uuid, display_name text, username text, avatar_url text, state text, since timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.id, p.display_name, p.username, p.avatar_url,
    case when f.status = 'accepted' then 'friends'
         when f.addressee_id = auth.uid() then 'incoming'
         else 'outgoing' end,
    coalesce(f.accepted_at, f.created_at)
  from public.friendships f
  join public.profiles p on p.id = case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end
  where auth.uid() in (f.requester_id, f.addressee_id)
  order by p.display_name;
$$;
revoke all on function public.my_friends() from public, anon;
grant execute on function public.my_friends() to authenticated;

-- Search players by username or name. Hides you and anyone blocked either way.
create function public.search_players(p_query text)
returns table (id uuid, display_name text, username text, avatar_url text)
language sql stable security definer set search_path = '' as $$
  with q as (select lower(trim(leading '@' from trim(coalesce(p_query, '')))) as s)
  select p.id, p.display_name, p.username, p.avatar_url
  from public.profiles p, q
  where auth.uid() is not null
    and char_length(q.s) >= 2
    and p.id <> auth.uid()
    and (
      p.username like replace(replace(replace(q.s, '\', '\\'), '%', '\%'), '_', '\_') || '%'
      or lower(p.display_name) like '%' || replace(replace(replace(q.s, '\', '\\'), '%', '\%'), '_', '\_') || '%'
    )
    and not private.blocked_between(auth.uid(), p.id)
  order by (p.username = q.s) desc, (p.username like q.s || '%') desc, p.display_name
  limit 20;
$$;
revoke all on function public.search_players(text) from public, anon;
grant execute on function public.search_players(text) to authenticated;

-- Blocking someone ends the friendship and any request between you.
create function private.unfriend_on_block() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.friendships
  where (requester_id = new.blocker_id and addressee_id = new.blocked_id)
     or (requester_id = new.blocked_id and addressee_id = new.blocker_id);
  return new;
end $$;
revoke all on function private.unfriend_on_block() from public, anon, authenticated;
create trigger unfriend_on_block after insert on public.player_blocks
  for each row execute function private.unfriend_on_block();
