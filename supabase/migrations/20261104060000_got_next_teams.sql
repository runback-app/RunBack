-- ============ GOT NEXT: TEAMS AT A COURT ============
-- Players checked in at a court can line up in teams of 5 for the next game.
-- Anyone checked in and not on a team is a free agent. That needs no table:
-- it's just live check-ins minus team members.
-- A team only counts players who are still checked in at that court, so an
-- expired check-in quietly drops off. Teams clear after 1 hour.
-- Nobody can touch these tables directly. Every write goes through the functions below.

create table public.court_teams (
  id uuid primary key default gen_random_uuid(),
  court_id uuid not null references public.courts(id) on delete cascade,
  captain_id uuid not null references public.profiles(id) on delete cascade,
  -- Exact time (not transaction time) so the line order is always clear.
  created_at timestamptz not null default clock_timestamp(),
  -- Set when the team steps on the court ("We're on").
  ended_at timestamptz,
  -- Set once the team has been told it's up next, so nobody gets the alert twice.
  alerted_at timestamptz
);
create index court_teams_open_idx on public.court_teams (court_id, created_at) where ended_at is null;
create index court_teams_captain_idx on public.court_teams (captain_id, created_at desc);

create table public.court_team_members (
  team_id uuid not null references public.court_teams(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default clock_timestamp(),
  primary key (team_id, user_id)
);
create index court_team_members_user_idx on public.court_team_members (user_id);

-- Queue for "You're up next" and "You got picked up" phone alerts. Service role only.
create table public.team_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  court_id uuid not null references public.courts(id) on delete cascade,
  title text not null,
  body text not null,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);
create index team_notifications_user_idx on public.team_notifications (user_id, created_at desc);
create index team_notifications_court_idx on public.team_notifications (court_id);

alter table public.court_teams enable row level security;
alter table public.court_team_members enable row level security;
alter table public.team_notifications enable row level security;
revoke all on public.court_teams, public.court_team_members, public.team_notifications from anon, authenticated;
grant all on public.court_teams, public.court_team_members, public.team_notifications to service_role;

-- ---------- Helpers (private, only used by the functions below) ----------

create function private.is_live_at(p_user uuid, p_court uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.checkins c
    where c.user_id = p_user and c.court_id = p_court and c.ended_at is null and c.expires_at > now()
  );
$$;

-- Players on a team who are still checked in at its court.
create function private.team_size(p_team uuid) returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int
  from public.court_team_members m
  join public.court_teams t on t.id = m.team_id
  where m.team_id = p_team and private.is_live_at(m.user_id, t.court_id);
$$;

-- The line at a court: teams that haven't gone on, are under an hour old, and
-- still have someone here. Oldest first.
create function private.open_teams(p_court uuid) returns setof public.court_teams
language sql stable security definer set search_path = '' as $$
  select t.*
  from public.court_teams t
  where t.court_id = p_court
    and t.ended_at is null
    and t.created_at > now() - interval '1 hour'
    and private.team_size(t.id) > 0
  order by t.created_at, t.id;
$$;

-- The captain is whoever started the team, or if they left, the next player who joined.
create function private.team_captain(p_team uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select m.user_id
  from public.court_team_members m
  join public.court_teams t on t.id = m.team_id
  where m.team_id = p_team and private.is_live_at(m.user_id, t.court_id)
  order by (m.user_id = t.captain_id) desc, m.joined_at, m.user_id
  limit 1;
$$;

-- The team a player is on right now, if any.
create function private.current_team(p_user uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select t.id
  from public.court_team_members m
  join public.court_teams t on t.id = m.team_id
  where m.user_id = p_user
    and t.ended_at is null
    and t.created_at > now() - interval '1 hour'
    and private.is_live_at(p_user, t.court_id)
  order by m.joined_at desc
  limit 1;
$$;

-- One change to a court's line at a time.
create function private.lock_court_line(p_court uuid) returns void
language sql security definer set search_path = '' as $$
  select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('court_line:' || p_court::text, 0));
$$;

-- If the first team in line hasn't been told yet, tell its players they're up next.
create function private.alert_up_next(p_court uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  first_team public.court_teams;
  court_name text;
begin
  select * into first_team from private.open_teams(p_court) limit 1;
  if first_team.id is null or first_team.alerted_at is not null then return; end if;
  update public.court_teams set alerted_at = now() where id = first_team.id;
  select name into court_name from public.courts where id = p_court;
  insert into public.team_notifications (user_id, court_id, title, body)
  select m.user_id, p_court, 'You''re up next', 'Your team is first in line at ' || court_name || '. Get ready.'
  from public.court_team_members m
  where m.team_id = first_team.id and private.is_live_at(m.user_id, p_court);
end;
$$;

-- Take a player off every open team (optionally keeping teams at one court).
create function private.leave_teams(p_user uuid, p_keep_court uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r record;
begin
  for r in
    select distinct t.court_id
    from public.court_team_members m
    join public.court_teams t on t.id = m.team_id
    where m.user_id = p_user and t.ended_at is null
      and (p_keep_court is null or t.court_id <> p_keep_court)
  loop
    perform private.lock_court_line(r.court_id);
    delete from public.court_team_members m
      using public.court_teams t
      where t.id = m.team_id and m.user_id = p_user and t.court_id = r.court_id and t.ended_at is null;
    perform private.alert_up_next(r.court_id);
  end loop;
end;
$$;

-- Put a player on a team. The caller has already locked the court's line.
create function private.add_to_team(p_user uuid, p_team uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  t public.court_teams;
begin
  select * into t from public.court_teams where id = p_team;
  if t.id is null or t.ended_at is not null or t.created_at <= now() - interval '1 hour' then
    raise exception 'That team is gone. Pick another one';
  end if;
  if not private.is_live_at(p_user, t.court_id) then
    raise exception 'Check in at this court to join a team';
  end if;
  -- Clear out players who left so their spot opens up.
  delete from public.court_team_members
    where team_id = p_team and not private.is_live_at(user_id, t.court_id);
  if private.team_size(p_team) >= 5 then raise exception 'That team is full'; end if;
  -- One team per player.
  delete from public.court_team_members m
    using public.court_teams x
    where x.id = m.team_id and m.user_id = p_user and x.ended_at is null and m.team_id <> p_team;
  insert into public.court_team_members (team_id, user_id) values (p_team, p_user)
    on conflict (team_id, user_id) do nothing;
end;
$$;

-- ---------- What the app calls ----------

-- The line at one court with each player's name and photo. Signed-in players only.
create function public.court_line(p_court_id uuid)
returns table (
  team_id uuid,
  team_created_at timestamptz,
  captain_id uuid,
  user_id uuid,
  joined_at timestamptz,
  display_name text,
  avatar_url text
)
language sql stable security definer set search_path = '' as $$
  select t.id, t.created_at, private.team_captain(t.id), m.user_id, m.joined_at, p.display_name, p.avatar_url
  from private.open_teams(p_court_id) t
  join public.court_team_members m on m.team_id = t.id and private.is_live_at(m.user_id, t.court_id)
  join public.profiles p on p.id = m.user_id
  where auth.uid() is not null
  order by t.created_at, t.id, m.joined_at, m.user_id;
$$;

-- Teams waiting and free agents per court. Numbers only, so anyone can see them.
create function public.court_line_counts()
returns table (court_id uuid, teams int, free_agents int)
language sql stable security definer set search_path = '' as $$
  with live as (
    select c.court_id, c.user_id from public.checkins c
    where c.ended_at is null and c.expires_at > now()
  ),
  on_teams as (
    select distinct t.court_id, t.id as team_id, m.user_id
    from public.court_teams t
    join public.court_team_members m on m.team_id = t.id
    join live l on l.user_id = m.user_id and l.court_id = t.court_id
    where t.ended_at is null and t.created_at > now() - interval '1 hour'
  )
  select l.court_id,
         (select count(distinct o.team_id)::int from on_teams o where o.court_id = l.court_id),
         (count(*) filter (where not exists (
            select 1 from on_teams o where o.court_id = l.court_id and o.user_id = l.user_id
          )))::int
  from live l
  group by l.court_id;
$$;

create function public.start_team(p_court_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  new_id uuid;
  first_in_line boolean;
begin
  if uid is null then raise exception 'Sign in to start a team'; end if;
  if not private.is_live_at(uid, p_court_id) then raise exception 'Check in at this court to start a team'; end if;
  if (select count(*) from public.court_teams where captain_id = uid and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Too many new teams. Try again later';
  end if;
  perform private.lock_court_line(p_court_id);
  delete from public.court_team_members m
    using public.court_teams t
    where t.id = m.team_id and m.user_id = uid and t.ended_at is null;
  perform private.alert_up_next(p_court_id);
  -- A team that starts at the front of an empty line already knows it's next.
  first_in_line := not exists (select 1 from private.open_teams(p_court_id));
  insert into public.court_teams (court_id, captain_id, alerted_at)
    values (p_court_id, uid, case when first_in_line then now() end)
    returning id into new_id;
  insert into public.court_team_members (team_id, user_id) values (new_id, uid);
  return new_id;
end;
$$;

create function public.join_team(p_team_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  team_court uuid;
begin
  if uid is null then raise exception 'Sign in to join a team'; end if;
  select court_id into team_court from public.court_teams where id = p_team_id;
  if team_court is null then raise exception 'That team is gone. Pick another one'; end if;
  perform private.lock_court_line(team_court);
  perform private.add_to_team(uid, p_team_id);
  perform private.alert_up_next(team_court);
end;
$$;

-- Joins the first team in line with an open spot, or starts a new team if none has room.
create function public.put_me_on_team(p_court_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  target uuid;
begin
  if uid is null then raise exception 'Sign in to join a team'; end if;
  if not private.is_live_at(uid, p_court_id) then raise exception 'Check in at this court to join a team'; end if;
  perform private.lock_court_line(p_court_id);
  select t.id into target
  from private.open_teams(p_court_id) t
  where private.team_size(t.id) < 5
    and not exists (select 1 from public.court_team_members m where m.team_id = t.id and m.user_id = uid)
  limit 1;
  if target is null then return public.start_team(p_court_id); end if;
  perform private.add_to_team(uid, target);
  perform private.alert_up_next(p_court_id);
  return target;
end;
$$;

create function public.leave_team() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  perform private.leave_teams(auth.uid(), null);
end;
$$;

-- "We're on": the team steps on the court and leaves the line. Anyone on the team can tap it.
create function public.team_on(p_team_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  team_court uuid;
begin
  if uid is null then raise exception 'Not signed in'; end if;
  select court_id into team_court from public.court_teams where id = p_team_id and ended_at is null;
  if team_court is null then raise exception 'That team already went on'; end if;
  perform private.lock_court_line(team_court);
  if not private.is_live_at(uid, team_court)
     or not exists (select 1 from public.court_team_members where team_id = p_team_id and user_id = uid) then
    raise exception 'Only players on this team can do that';
  end if;
  update public.court_teams set ended_at = now() where id = p_team_id and ended_at is null;
  perform private.alert_up_next(team_court);
end;
$$;

-- A captain with open spots pulls a free agent onto their team. The player gets an alert.
create function public.add_free_agent(p_user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  my_team uuid;
  team_court uuid;
  captain_name text;
  court_name text;
begin
  if uid is null then raise exception 'Not signed in'; end if;
  my_team := private.current_team(uid);
  if my_team is null then raise exception 'Start a team first'; end if;
  if private.team_captain(my_team) is distinct from uid then raise exception 'Only the captain can add players'; end if;
  select court_id into team_court from public.court_teams where id = my_team;
  perform private.lock_court_line(team_court);
  if not private.is_live_at(p_user_id, team_court) then raise exception 'That player isn''t checked in here'; end if;
  if private.current_team(p_user_id) is not null then raise exception 'That player is already on a team'; end if;
  perform private.add_to_team(p_user_id, my_team);
  select display_name into captain_name from public.profiles where id = uid;
  select name into court_name from public.courts where id = team_court;
  insert into public.team_notifications (user_id, court_id, title, body)
    values (p_user_id, team_court, 'You got picked up', captain_name || ' added you to their team at ' || court_name || '.');
  perform private.alert_up_next(team_court);
end;
$$;

-- ---------- Check-in changes ----------
-- Same as before, plus: moving to another court takes you off teams at the old one,
-- and leaving the court takes you off your team. Resetting your time at the same court keeps your team.

create or replace function public.check_in(p_court_id uuid, p_minutes int default 120)
returns public.checkins
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  result public.checkins;
begin
  if uid is null then raise exception 'Sign in to check in'; end if;
  if p_minutes is null or p_minutes < 30 or p_minutes > 240 then
    raise exception 'Check-ins last between 30 minutes and 4 hours';
  end if;
  if not exists (select 1 from public.courts where id = p_court_id) then
    raise exception 'Court not found';
  end if;
  perform private.leave_teams(uid, p_court_id);
  -- You can only be at one court at a time.
  update public.checkins set ended_at = now()
    where user_id = uid and ended_at is null and expires_at > now();
  insert into public.checkins (court_id, user_id, expires_at)
    values (p_court_id, uid, now() + make_interval(mins => p_minutes))
    returning * into result;
  return result;
end;
$$;

create or replace function public.check_out()
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  perform private.leave_teams(auth.uid(), null);
  update public.checkins set ended_at = now()
    where user_id = auth.uid() and ended_at is null and expires_at > now();
end;
$$;

-- ---------- Phone alerts ----------
-- The send-alerts function calls this with a queued notification and gets back where to send it.
create function public.team_alert_targets(p_notification_id uuid)
returns table (endpoint text, p256dh text, auth text, title text, body text, url text)
language plpgsql security invoker set search_path = '' as $$
declare
  n public.team_notifications;
begin
  update public.team_notifications set processed_at = now()
    where id = p_notification_id and processed_at is null and created_at > now() - interval '5 minutes'
    returning * into n;
  if n.id is null then return; end if;
  return query
    select s.endpoint, s.p256dh, s.auth, n.title, n.body, '/court/' || c.slug
    from public.push_subscriptions s
    join public.courts c on c.id = n.court_id
    where s.user_id = n.user_id;
end;
$$;

create function private.queue_team_push() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform net.http_post(
    url := 'https://ioxmdthiblgudygedjmc.supabase.co/functions/v1/send-alerts',
    body := jsonb_build_object('team_notification_id', new.id),
    headers := jsonb_build_object('Content-Type', 'application/json'),
    timeout_milliseconds := 5000
  );
  return new;
end;
$$;
create trigger team_notification_push after insert on public.team_notifications
  for each row execute function private.queue_team_push();

-- ---------- Cleanup ----------
-- Teams (and who was on them) are deleted after a day; alert records after a week.
select cron.schedule(
  'delete-old-court-teams',
  '41 * * * *',
  $$delete from public.court_teams where created_at < now() - interval '1 day';
    delete from public.team_notifications where created_at < now() - interval '7 days'$$
);

-- ---------- Permissions ----------
revoke all on function private.is_live_at(uuid, uuid) from public, anon, authenticated;
revoke all on function private.team_size(uuid) from public, anon, authenticated;
revoke all on function private.open_teams(uuid) from public, anon, authenticated;
revoke all on function private.team_captain(uuid) from public, anon, authenticated;
revoke all on function private.current_team(uuid) from public, anon, authenticated;
revoke all on function private.lock_court_line(uuid) from public, anon, authenticated;
revoke all on function private.alert_up_next(uuid) from public, anon, authenticated;
revoke all on function private.leave_teams(uuid, uuid) from public, anon, authenticated;
revoke all on function private.add_to_team(uuid, uuid) from public, anon, authenticated;
revoke all on function private.queue_team_push() from public, anon, authenticated;

revoke all on function public.court_line(uuid) from public, anon;
revoke all on function public.court_line_counts() from public;
revoke all on function public.start_team(uuid) from public, anon;
revoke all on function public.join_team(uuid) from public, anon;
revoke all on function public.put_me_on_team(uuid) from public, anon;
revoke all on function public.leave_team() from public, anon;
revoke all on function public.team_on(uuid) from public, anon;
revoke all on function public.add_free_agent(uuid) from public, anon;
revoke all on function public.team_alert_targets(uuid) from public, anon, authenticated;

grant execute on function public.court_line(uuid) to authenticated;
grant execute on function public.court_line_counts() to anon, authenticated;
grant execute on function public.start_team(uuid) to authenticated;
grant execute on function public.join_team(uuid) to authenticated;
grant execute on function public.put_me_on_team(uuid) to authenticated;
grant execute on function public.leave_team() to authenticated;
grant execute on function public.team_on(uuid) to authenticated;
grant execute on function public.add_free_agent(uuid) to authenticated;
grant execute on function public.team_alert_targets(uuid) to service_role;
