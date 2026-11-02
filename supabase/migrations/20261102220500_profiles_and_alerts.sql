-- Player profiles, favorite courts, court locations, and push alert plumbing.

-- ============ COURT LOCATIONS (for the map) ============
alter table public.courts add column lat double precision, add column lng double precision;
update public.courts set lat = 32.227724, lng = -110.950933 where slug = 'south-rec';
update public.courts set lat = 32.238661, lng = -110.956012 where slug = 'north-rec';
update public.courts set lat = 32.210600, lng = -110.921900 where slug = 'reid-park';
update public.courts set lat = 32.233687, lng = -110.933702 where slug = 'himmel-park';

-- ============ PLAYER PROFILES ============
alter table public.profiles
  add column position text check (position in ('PG', 'SG', 'SF', 'PF', 'C')),
  add column skill text check (skill in ('fun', 'regular', 'competitive', 'college')),
  add column height_in int check (height_in between 48 and 96),
  add column home_court_id uuid references public.courts(id) on delete set null,
  add column bio text check (char_length(bio) <= 160),
  add column avatar_url text check (
    avatar_url is null
    or avatar_url like 'https://ioxmdthiblgudygedjmc.supabase.co/storage/v1/object/public/avatars/%'
  ),
  add column notify_crew boolean not null default true,
  add column updated_at timestamptz not null default now();
create index profiles_home_court_idx on public.profiles (home_court_id);

-- Photos: public to view, but you can only upload into your own folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "Players upload their own photo" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Players replace their own photo" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Players delete their own photo" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ============ FAVORITE COURTS (and court alerts) ============
create table public.court_favorites (
  user_id uuid not null references public.profiles(id) on delete cascade,
  court_id uuid not null references public.courts(id) on delete cascade,
  alerts boolean not null default true,
  alert_at int not null default 6 check (alert_at between 2 and 10),
  last_alert_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (user_id, court_id)
);
create index court_favorites_court_idx on public.court_favorites (court_id);
alter table public.court_favorites enable row level security;
create policy "Players see their own favorites" on public.court_favorites
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Players add favorites" on public.court_favorites
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Players change favorites" on public.court_favorites
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Players remove favorites" on public.court_favorites
  for delete to authenticated using ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.court_favorites to authenticated;
revoke all on public.court_favorites from anon;

-- ============ PUSH SUBSCRIPTIONS (one per device) ============
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
create policy "Players see their own devices" on public.push_subscriptions
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Players remove their own devices" on public.push_subscriptions
  for delete to authenticated using ((select auth.uid()) = user_id);
grant select, delete on public.push_subscriptions to authenticated;
revoke all on public.push_subscriptions from anon;

-- Saving goes through a function so a shared phone switches to whoever signed in last.
create function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in to turn on alerts'; end if;
  if p_endpoint is null or p_endpoint !~ '^https://' or char_length(p_endpoint) > 1000 then
    raise exception 'That device can''t get alerts';
  end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth;
end;
$$;
revoke execute on function public.save_push_subscription(text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text) to authenticated;

-- ============ WHO GETS ALERTED FOR A CHECK-IN ============
alter table public.checkins
  add column processed_at timestamptz,
  add column crew_alerted boolean not null default false;

-- Called only by the alert sender (service role). Claims a fresh check-in exactly once and
-- returns one row per device that should get an alert.
create function public.alert_targets(p_checkin_id uuid)
returns table (endpoint text, p256dh text, auth text, title text, body text, url text)
language plpgsql security definer set search_path = '' as $$
declare
  c public.checkins;
  ct public.courts;
  player text;
  live_count int;
  same_court_reset boolean;
  recently_alerted boolean;
  until_text text;
begin
  -- Claim it. Old or already-handled check-ins return nothing, so repeat calls are harmless.
  update public.checkins
    set processed_at = now()
    where id = p_checkin_id
      and processed_at is null
      and ended_at is null
      and created_at > now() - interval '5 minutes'
    returning * into c;
  if c.id is null then return; end if;

  select * into ct from public.courts where id = c.court_id;
  select display_name into player from public.profiles where id = c.user_id;
  select count(*) into live_count from public.checkins
    where court_id = c.court_id and ended_at is null and expires_at > now();
  until_text := trim(to_char(c.expires_at at time zone 'America/Phoenix', 'FMHH12:MI AM'));

  -- Resetting your time at the same court, or checking in again within 30 minutes,
  -- shouldn't ping your crew again.
  select exists (
    select 1 from public.checkins o
    where o.user_id = c.user_id and o.id <> c.id and o.court_id = c.court_id
      and o.ended_at >= c.created_at - interval '1 minute'
  ) into same_court_reset;
  select exists (
    select 1 from public.checkins o
    where o.user_id = c.user_id and o.id <> c.id and o.crew_alerted
      and o.created_at > now() - interval '30 minutes'
  ) into recently_alerted;

  create temp table if not exists _alert_people (user_id uuid primary key, title text, body text) on commit drop;
  truncate _alert_people;

  if not same_court_reset and not recently_alerted then
    insert into _alert_people (user_id, title, body)
    select distinct m2.user_id,
           player || ' checked in at ' || ct.name,
           'Playing until ' || until_text || '. Tap to see who''s there.'
    from public.crew_members m1
    join public.crew_members m2 on m2.crew_id = m1.crew_id
    join public.profiles p on p.id = m2.user_id
    where m1.user_id = c.user_id and m2.user_id <> c.user_id and p.notify_crew
    on conflict do nothing;
    if found then
      update public.checkins set crew_alerted = true where id = c.id;
    end if;
  end if;

  -- Court alerts: favorites whose player count just hit their number. At most once per 3 hours.
  with due as (
    update public.court_favorites f
      set last_alert_at = now()
      where f.court_id = c.court_id
        and f.alerts
        and f.user_id <> c.user_id
        and live_count >= f.alert_at
        and (f.last_alert_at is null or f.last_alert_at < now() - interval '3 hours')
        and not exists (select 1 from _alert_people a where a.user_id = f.user_id)
      returning f.user_id
  )
  insert into _alert_people (user_id, title, body)
  select due.user_id, ct.name || ' has ' || live_count || ' players', 'There''s a run going. Tap to see who''s there.'
  from due
  on conflict do nothing;

  -- Nobody needs an alert about the court they're already at.
  delete from _alert_people a
  using public.checkins o
  where o.user_id = a.user_id and o.court_id = c.court_id and o.ended_at is null and o.expires_at > now();

  return query
    select s.endpoint, s.p256dh, s.auth, a.title, a.body, '/court/' || ct.slug
    from _alert_people a
    join public.push_subscriptions s on s.user_id = a.user_id;
end;
$$;
revoke execute on function public.alert_targets(uuid) from public, anon, authenticated;
grant execute on function public.alert_targets(uuid) to service_role;

-- The alert sender reads the VAPID private key from Vault through this, never from code.
create function public.alert_signing_key()
returns text
language sql stable security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'vapid_private_key' limit 1;
$$;
revoke execute on function public.alert_signing_key() from public, anon, authenticated;
grant execute on function public.alert_signing_key() to service_role;

-- ============ SEND ALERTS RIGHT AFTER A CHECK-IN ============
create extension if not exists pg_net with schema extensions;

create function private.queue_checkin_alerts()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform net.http_post(
    url := 'https://ioxmdthiblgudygedjmc.supabase.co/functions/v1/send-alerts',
    body := jsonb_build_object('checkin_id', new.id),
    headers := jsonb_build_object('Content-Type', 'application/json'),
    timeout_milliseconds := 5000
  );
  return new;
end;
$$;
create trigger checkin_alerts
  after insert on public.checkins
  for each row execute function private.queue_checkin_alerts();
