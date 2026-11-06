-- ============ ONE NAME ============
-- Your username IS your name on Runback. No separate "display name".
-- * Usernames keep capitals as typed ("NickK"), but are unique ignoring case
--   ("nickk" is taken if "NickK" exists). Letters, numbers, _; 3-20 long.
-- * display_name stays as a column (the whole app reads it) but always equals username.
--   A trigger copies username into it; editing display_name on its own does nothing.

-- Usernames may now have capitals; uniqueness ignores case.
alter table public.profiles drop constraint profiles_username_format;
alter table public.profiles drop constraint profiles_username_key;
alter table public.profiles add constraint profiles_username_format check (username ~ '^[A-Za-z0-9_]{3,20}$');
create unique index profiles_username_lower_key on public.profiles (lower(username));

-- Name -> free username, keeping capitals: "Nick Katz" -> "NickKatz", or "NickKatz4821" if taken.
-- p_self: the player it's for (so their own current username doesn't count as taken).
drop function private.make_username(text);
create function private.make_username(p_name text, p_self uuid default null) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  base text := left(regexp_replace(coalesce(p_name, ''), '[^A-Za-z0-9_]', '', 'g'), 15);
  pick text;
begin
  if char_length(base) < 3 or private.has_banned_word(replace(base, '_', ' ')) then base := 'Player'; end if;
  pick := base;
  while exists (
    select 1 from public.profiles
    where lower(username) = lower(pick) and id is distinct from p_self
  ) loop
    pick := base || (1000 + floor(random() * 9000))::int::text;
  end loop;
  return pick;
end $$;
revoke all on function private.make_username(text, uuid) from public, anon, authenticated;

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

-- display_name always = username. Named to run before filter_profile (triggers run in name order).
create function private.name_is_username() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.display_name := new.username;
  return new;
end $$;
revoke all on function private.name_is_username() from public, anon, authenticated;
create trigger a_name_is_username before insert or update on public.profiles
  for each row execute function private.name_is_username();

-- Existing players: username rebuilt from their name with capitals kept (oldest first),
-- then display_name follows it.
do $$ declare r record; begin
  for r in select id, display_name from public.profiles order by created_at loop
    update public.profiles set username = private.make_username(r.display_name, r.id) where id = r.id;
  end loop;
end $$;

-- Word filter: username is the only name now.
create or replace function private.filter_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if private.has_banned_word(new.bio) then new.bio := null; end if;
    return new;
  end if;
  if new.username is distinct from old.username and private.has_banned_word(replace(new.username, '_', ' ')) then
    raise exception 'That name has words that aren''t allowed on Runback. Pick another one.';
  end if;
  if new.bio is distinct from old.bio and private.has_banned_word(new.bio) then
    raise exception 'Your bio has words that aren''t allowed on Runback. Edit it and try again.';
  end if;
  return new;
end $$;
revoke all on function private.filter_profile() from public, anon, authenticated;

-- Search ignores case.
create or replace function public.search_players(p_query text)
returns table (id uuid, display_name text, username text, avatar_url text)
language sql stable security definer set search_path = '' as $$
  with q as (select lower(trim(leading '@' from trim(coalesce(p_query, '')))) as s),
  e as (select replace(replace(replace(s, '\', '\\'), '%', '\%'), '_', '\_') as s from q)
  select p.id, p.display_name, p.username, p.avatar_url
  from public.profiles p, q, e
  where auth.uid() is not null
    and char_length(q.s) >= 2
    and p.id <> auth.uid()
    and lower(p.username) like '%' || e.s || '%'
    and not private.blocked_between(auth.uid(), p.id)
  order by (lower(p.username) = q.s) desc, (lower(p.username) like e.s || '%') desc, lower(p.username)
  limit 20;
$$;
revoke all on function public.search_players(text) from public, anon;
grant execute on function public.search_players(text) to authenticated;

-- Friend links: find a player by username, ignoring case.
create function public.find_player(p_username text)
returns table (id uuid, display_name text, username text, avatar_url text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.display_name, p.username, p.avatar_url
  from public.profiles p
  where auth.uid() is not null and lower(p.username) = lower(trim(leading '@' from trim(coalesce(p_username, ''))))
  limit 1;
$$;
revoke all on function public.find_player(text) from public, anon;
grant execute on function public.find_player(text) to authenticated;
