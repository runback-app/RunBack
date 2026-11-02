-- Runback core schema: profiles, courts, check-ins, crews.
-- Every table has row level security on. Writes that need rules (check in, create/join crew)
-- go through the functions below so the rules live in one place.

-- ============ PROFILES ============
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create policy "Signed-in users can read profiles" on public.profiles
  for select to authenticated using (true);
create policy "Users can update their own profile" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'), ''), split_part(new.email, '@', 1), 'Player'), 40)
  );
  return new;
end;
$$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- ============ COURTS ============
create table public.courts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  kind text not null check (kind in ('indoor', 'outdoor')),
  area text not null,
  address text not null,
  -- 7 entries, Sunday..Saturday. Each is [open_minute, close_minute] in Tucson time, or null when closed.
  hours jsonb not null check (jsonb_typeof(hours) = 'array' and jsonb_array_length(hours) = 7),
  note text,
  sort_order int not null default 0
);
alter table public.courts enable row level security;
create policy "Anyone can read courts" on public.courts
  for select to anon, authenticated using (true);

-- ============ CHECK-INS ============
create table public.checkins (
  id uuid primary key default gen_random_uuid(),
  court_id uuid not null references public.courts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ended_at timestamptz,
  constraint checkin_length check (expires_at > created_at and expires_at <= created_at + interval '4 hours')
);
create index checkins_court_active_idx on public.checkins (court_id, expires_at) where ended_at is null;
create index checkins_user_active_idx on public.checkins (user_id, expires_at) where ended_at is null;
alter table public.checkins enable row level security;
-- Only live check-ins are visible, and only to signed-in players. Writes go through functions below.
create policy "Signed-in users can see live check-ins" on public.checkins
  for select to authenticated using (ended_at is null and expires_at > now());

create function public.check_in(p_court_id uuid, p_minutes int default 120)
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
  -- You can only be at one court at a time.
  update public.checkins set ended_at = now()
    where user_id = uid and ended_at is null and expires_at > now();
  insert into public.checkins (court_id, user_id, expires_at)
    values (p_court_id, uid, now() + make_interval(mins => p_minutes))
    returning * into result;
  return result;
end;
$$;

create function public.check_out()
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  update public.checkins set ended_at = now()
    where user_id = auth.uid() and ended_at is null and expires_at > now();
end;
$$;

-- Player counts per court are public (no names).
create function public.court_activity()
returns table (court_id uuid, players int)
language sql stable security definer set search_path = '' as $$
  select c.court_id, count(*)::int
  from public.checkins c
  where c.ended_at is null and c.expires_at > now()
  group by c.court_id;
$$;

-- ============ CREWS ============
create table public.crews (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 40),
  court_id uuid references public.courts(id) on delete set null,
  schedule text check (schedule is null or char_length(schedule) <= 80),
  invite_code text not null unique default substr(encode(extensions.gen_random_bytes(8), 'hex'), 1, 10),
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index crews_court_idx on public.crews (court_id);
create index crews_created_by_idx on public.crews (created_by);

create table public.crew_members (
  crew_id uuid not null references public.crews(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (crew_id, user_id)
);
create index crew_members_user_idx on public.crew_members (user_id);

alter table public.crews enable row level security;
alter table public.crew_members enable row level security;

-- (Moved to the private schema in a later migration.)
create function public.is_crew_member(p_crew_id uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.crew_members
    where crew_id = p_crew_id and user_id = auth.uid()
  );
$$;

create policy "Members can see their crews" on public.crews
  for select to authenticated using (public.is_crew_member(id));
create policy "Owners can edit their crews" on public.crews
  for update to authenticated
  using ((select auth.uid()) = created_by) with check ((select auth.uid()) = created_by);
create policy "Owners can delete their crews" on public.crews
  for delete to authenticated using ((select auth.uid()) = created_by);

create policy "Members can see crewmates" on public.crew_members
  for select to authenticated using (public.is_crew_member(crew_id));
create policy "Members can leave a crew" on public.crew_members
  for delete to authenticated using ((select auth.uid()) = user_id and role = 'member');

create function public.create_crew(p_name text, p_court_id uuid, p_schedule text)
returns public.crews
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  result public.crews;
begin
  if uid is null then raise exception 'Sign in to create a crew'; end if;
  if (select count(*) from public.crews where created_by = uid) >= 10 then
    raise exception 'You can run up to 10 crews';
  end if;
  insert into public.crews (name, court_id, schedule, created_by)
    values (trim(p_name), p_court_id, nullif(trim(coalesce(p_schedule, '')), ''), uid)
    returning * into result;
  insert into public.crew_members (crew_id, user_id, role) values (result.id, uid, 'owner');
  return result;
end;
$$;

-- What someone sees when they open an invite link (works before signing in).
create function public.crew_preview(p_code text)
returns table (id uuid, name text, schedule text, court_name text, members int)
language sql stable security definer set search_path = '' as $$
  select c.id, c.name, c.schedule, ct.name,
         (select count(*)::int from public.crew_members m where m.crew_id = c.id)
  from public.crews c
  left join public.courts ct on ct.id = c.court_id
  where c.invite_code = lower(trim(p_code));
$$;

create function public.join_crew(p_code text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  target uuid;
begin
  if uid is null then raise exception 'Sign in to join'; end if;
  select id into target from public.crews where invite_code = lower(trim(p_code));
  if target is null then raise exception 'That invite link is not valid'; end if;
  insert into public.crew_members (crew_id, user_id) values (target, uid)
    on conflict (crew_id, user_id) do nothing;
  return target;
end;
$$;

-- ============ PERMISSIONS ============
grant select on public.courts to anon, authenticated;
grant select, update on public.profiles to authenticated;
grant select on public.checkins to authenticated;
grant select, update, delete on public.crews to authenticated;
grant select, delete on public.crew_members to authenticated;

revoke execute on function public.check_in(uuid, int) from public, anon;
revoke execute on function public.check_out() from public, anon;
revoke execute on function public.create_crew(text, uuid, text) from public, anon;
revoke execute on function public.join_crew(text) from public, anon;
grant execute on function public.check_in(uuid, int) to authenticated;
grant execute on function public.check_out() to authenticated;
grant execute on function public.create_crew(text, uuid, text) to authenticated;
grant execute on function public.join_crew(text) to authenticated;
grant execute on function public.court_activity() to anon, authenticated;
grant execute on function public.crew_preview(text) to anon, authenticated;
revoke execute on function public.is_crew_member(uuid) from public, anon;
grant execute on function public.is_crew_member(uuid) to authenticated;
