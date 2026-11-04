-- ============ WORD FILTER ============
-- Blocks slurs, sexual content, and "kill yourself"-type threats in:
--   * court chat messages (the message is refused with a clear note)
--   * player names and bios (refused on save; a bad name at signup becomes "Player")
-- Regular cussing is allowed on purpose. Crew chat is private (invite-only) and isn't filtered.
--
-- How matching works:
--   * lowercase, common look-alikes swapped back (0→o, 1→i, 3→e, 4→a, 5→s, 7→t, @→a, $→s, !→i)
--   * dots/dashes inside a word are ignored ("f.a.g" → "fag")
--   * stretched letters still match ("fagggot")
--   * whole words only, so "spicy", "raccoon", "grape", "Niger" are fine
--   * a few words marked `anywhere` also match inside other words
-- To add a word: insert into private.banned_words (word) values ('...');  (lowercase letters and spaces only)

create table private.banned_words (
  word text primary key check (word ~ '^[a-z]+( [a-z]+)*$'),
  anywhere boolean not null default false
);
alter table private.banned_words enable row level security;
revoke all on private.banned_words from public, anon, authenticated;

insert into private.banned_words (word, anywhere) values
  -- racial and ethnic slurs
  ('nigger', true), ('nigga', true), ('spic', false), ('spick', false), ('chink', false),
  ('kike', false), ('wetback', true), ('gook', false), ('beaner', false), ('coon', false),
  ('raghead', true), ('towelhead', true), ('sand nigger', false), ('jigaboo', true), ('porch monkey', false),
  -- anti-gay, anti-trans, ableist slurs
  ('faggot', true), ('fag', false), ('dyke', false), ('tranny', false), ('retard', false), ('retarded', false),
  -- hate groups
  ('heil hitler', false), ('sieg heil', false), ('white power', false),
  -- sexual
  ('porn', false), ('porno', false), ('pornhub', true), ('cum', false), ('blowjob', true), ('handjob', true),
  ('nudes', false), ('pussy', false), ('cock', false), ('cunt', false), ('whore', false), ('slut', false),
  ('rape', false), ('raping', false), ('rapist', false), ('dildo', true), ('jizz', false),
  -- threats
  ('kill yourself', false), ('kill urself', false), ('kill yourselves', false), ('kys', false), ('hang yourself', false);

-- Makes text easier to match: lowercase, look-alikes swapped, dots/dashes inside words removed.
create function private.normalize_for_filter(p_text text) returns text
language sql immutable set search_path = '' as $$
  select regexp_replace(
    translate(lower(coalesce(p_text, '')), '0134579@$!|', 'oieastgasii'),
    '([a-z])[^a-z[:space:]]+(?=[a-z])', '\1', 'g'
  );
$$;

-- True if the text contains a banned word.
create function private.has_banned_word(p_text text) returns boolean
language sql stable security definer set search_path = '' as $$
  with t as (select private.normalize_for_filter(p_text) as s),
  w as (
    select
      -- each letter may repeat ("fagggot"); spaces may be any non-letters ("kill_yourself")
      replace(regexp_replace(word, '([a-z])', '\1+', 'g'), ' ', '[^a-z]*') as core,
      anywhere
    from private.banned_words
  )
  select exists (
    select 1 from t, w
    where case
      when w.anywhere then t.s ~ w.core
      else t.s ~ ('(^|[^a-z])' || w.core || '(s|es|z|ed|ing)?([^a-z]|$)')
    end
  );
$$;
revoke all on function private.normalize_for_filter(text) from public, anon;
revoke all on function private.has_banned_word(text) from public, anon, authenticated;

-- Court chat: refuse messages with banned words. Runs before the spam limit trigger
-- (triggers run in name order), so a refused message doesn't count toward the limit.
create function private.filter_court_chat() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if private.has_banned_word(new.body) then
    raise exception 'That message has words that aren''t allowed on Runback. Edit it and try again.';
  end if;
  return new;
end $$;
revoke all on function private.filter_court_chat() from public, anon, authenticated;
create trigger filter_court_chat before insert on public.court_messages
  for each row execute function private.filter_court_chat();

-- Profiles: refuse a bad name or bio on save. At signup, swap a bad name for "Player"
-- so signing up never fails with a confusing error.
create function private.filter_profile() returns trigger
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
  return new;
end $$;
revoke all on function private.filter_profile() from public, anon, authenticated;
create trigger filter_profile before insert or update of display_name, bio on public.profiles
  for each row execute function private.filter_profile();
