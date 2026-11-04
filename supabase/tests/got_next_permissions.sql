-- Got next (teams) rules. Fully rolled back, including queued phone alerts:
-- never changes live data. Uses two disposable courts and six players.
begin;
create temp table gn as
select gen_random_uuid() a, gen_random_uuid() b, gen_random_uuid() c, gen_random_uuid() d,
       gen_random_uuid() e, gen_random_uuid() f, gen_random_uuid() court_a, gen_random_uuid() court_b,
       null::uuid team1, null::uuid team2;
alter table gn enable row level security;
create policy gn_read on gn for select to authenticated, anon using (true);
create policy gn_write on gn for update to authenticated using (true) with check (true);
grant select, update on gn to authenticated, anon;

insert into auth.users(id,aud,role,email,raw_user_meta_data,created_at,updated_at)
select v.id,'authenticated','authenticated',v.id::text||'@example.invalid',
  jsonb_build_object('display_name','Got next test'),now(),now()
from gn, lateral (values (a),(b),(c),(d),(e),(f)) v(id);
insert into public.courts(id,slug,name,kind,area,address,hours)
select v.id,'qa-'||v.id::text,'Disposable QA court','outdoor','QA','QA','[null,null,null,null,null,null,null]'::jsonb
from gn, lateral (values (court_a),(court_b)) v(id);

create function pg_temp.as_player(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
$$;

set local role authenticated;

-- Everyone checks in at court A.
select pg_temp.as_player(a) from gn; select public.check_in(court_a, 120) from gn;
select pg_temp.as_player(b) from gn; select public.check_in(court_a, 120) from gn;
select pg_temp.as_player(c) from gn; select public.check_in(court_a, 120) from gn;
select pg_temp.as_player(d) from gn; select public.check_in(court_a, 120) from gn;
select pg_temp.as_player(e) from gn; select public.check_in(court_a, 120) from gn;
select pg_temp.as_player(f) from gn; select public.check_in(court_a, 120) from gn;

-- A starts team 1. B taps "Put me on a team" and lands on it.
select pg_temp.as_player(a) from gn;
update gn set team1 = public.start_team(court_a);
select pg_temp.as_player(b) from gn;
do $$begin
  if public.put_me_on_team((select court_a from gn)) <> (select team1 from gn) then
    raise exception 'Put me on a team did not join the first open team';
  end if;
end$$;

-- C starts team 2 (second in line).
select pg_temp.as_player(c) from gn;
update gn set team2 = public.start_team(court_a);

do $$begin
  if (select count(distinct team_id) from public.court_line((select court_a from gn))) <> 2 then
    raise exception 'Line should show 2 teams';
  end if;
  if (select team_id from public.court_line((select court_a from gn)) limit 1) <> (select team1 from gn) then
    raise exception 'Oldest team should be first';
  end if;
  if (select teams from public.court_line_counts() where court_id = (select court_a from gn)) <> 2
     or (select free_agents from public.court_line_counts() where court_id = (select court_a from gn)) <> 3 then
    raise exception 'Counts wrong: expected 2 teams and 3 free agents';
  end if;
end$$;

-- Tables can't be touched directly.
do $$begin
  begin
    insert into public.court_team_members(team_id, user_id) select team1, d from gn;
    raise exception 'Could add someone to a team directly';
  exception when insufficient_privilege then null; end;
  begin
    perform 1 from public.court_teams;
    raise exception 'Could read teams table directly';
  exception when insufficient_privilege then null; end;
end$$;

-- Only the captain can add a free agent.
select pg_temp.as_player(b) from gn;
do $$begin
  begin
    perform public.add_free_agent((select f from gn));
    raise exception 'Non-captain added a free agent';
  exception when raise_exception then if sqlerrm not like 'Only the captain%' then raise; end if; end;
end$$;
select pg_temp.as_player(a) from gn;
select public.add_free_agent(f) from gn;
do $$begin
  if (select count(*) from public.court_line((select court_a from gn)) where team_id = (select team1 from gn)) <> 3 then
    raise exception 'Free agent was not added';
  end if;
  begin
    perform public.add_free_agent((select c from gn));
    raise exception 'Added a player who is already on a team';
  exception when raise_exception then if sqlerrm not like 'That player is already%' then raise; end if; end;
end$$;

-- Teams max out at 5.
select pg_temp.as_player(d) from gn; select public.join_team(team1) from gn;
select pg_temp.as_player(e) from gn; select public.join_team(team1) from gn;
reset role;
insert into auth.users(id,aud,role,email,raw_user_meta_data,created_at,updated_at)
values ('00000000-0000-4000-8000-0000000000aa','authenticated','authenticated','gn-extra@example.invalid',
  jsonb_build_object('display_name','Got next extra'),now(),now());
set local role authenticated;
select pg_temp.as_player('00000000-0000-4000-8000-0000000000aa');
select public.check_in(court_a, 60) from gn;
do $$begin
  begin
    perform public.join_team((select team1 from gn));
    raise exception 'Joined a full team';
  exception when raise_exception then if sqlerrm <> 'That team is full' then raise; end if; end;
end$$;

-- Someone not on the team can't say "We're on" for it.
do $$begin
  begin
    perform public.team_on((select team1 from gn));
    raise exception 'Outsider marked a team as on';
  exception when raise_exception then if sqlerrm not like 'Only players on this team%' then raise; end if; end;
end$$;

-- Team 1 goes on. Team 2 is now first and C gets a "You're up next" alert.
select pg_temp.as_player(b) from gn;
select public.team_on(team1) from gn;
do $$begin
  if (select team_id from public.court_line((select court_a from gn)) limit 1) <> (select team2 from gn) then
    raise exception 'Team 2 should be first after team 1 went on';
  end if;
end$$;
reset role;
do $$begin
  if not exists (select 1 from public.team_notifications
                 where user_id = (select c from gn) and title = 'You''re up next') then
    raise exception 'Up-next alert was not queued';
  end if;
  if not exists (select 1 from public.team_notifications
                 where user_id = (select f from gn) and title = 'You got picked up') then
    raise exception 'Picked-up alert was not queued';
  end if;
end$$;
set local role authenticated;

-- Moving to another court takes you off your team; the empty team leaves the line.
select pg_temp.as_player(c) from gn;
select public.check_in(court_b, 60) from gn;
do $$begin
  if exists (select 1 from public.court_line((select court_a from gn))) then
    raise exception 'Player stayed on a team after moving courts';
  end if;
end$$;

-- Resetting your time at the same court keeps your team.
select pg_temp.as_player(d) from gn;
select public.start_team(court_a) from gn;
select public.check_in(court_a, 90) from gn;
do $$begin
  if not exists (select 1 from public.court_line((select court_a from gn)) where user_id = (select d from gn)) then
    raise exception 'Resetting check-in time dropped the player from their team';
  end if;
end$$;

-- Leaving the court takes you off your team.
select public.check_out();
do $$begin
  if exists (select 1 from public.court_line((select court_a from gn)) where user_id = (select d from gn)) then
    raise exception 'Checked-out player still on a team';
  end if;
end$$;

-- Must be checked in to start a team.
do $$begin
  begin
    perform public.start_team((select court_a from gn));
    raise exception 'Started a team without checking in';
  exception when raise_exception then if sqlerrm not like 'Check in at this court%' then raise; end if; end;
end$$;

-- Signed-out visitors see counts, never names.
reset role;
set local role anon;
do $$begin
  perform * from public.court_line_counts();
  begin
    perform * from public.court_line((select court_a from gn));
    raise exception 'Anonymous visitor could read the line';
  exception when insufficient_privilege then null; end;
end$$;
reset role;

rollback;
