-- Block a player. Fully rolled back: the 3 temporary players, disposable court,
-- messages, blocks, teams and queued alerts are never kept.
begin;
create temp table bp as
select gen_random_uuid() a, gen_random_uuid() b, gen_random_uuid() c, gen_random_uuid() court_id;
alter table bp enable row level security;
create policy bp_read on bp for select to authenticated, anon using (true);
grant select on bp to authenticated, anon;

insert into auth.users(id,aud,role,email,raw_user_meta_data,created_at,updated_at)
select v.id,'authenticated','authenticated',v.id::text||'@example.invalid',
  jsonb_build_object('display_name','Block test '||v.n),now(),now()
from bp, lateral (values (a,'A'),(b,'B'),(c,'C')) v(id,n);
insert into public.courts(id,slug,name,kind,area,address,hours)
select court_id,'qa-'||court_id::text,'Disposable QA court','outdoor','QA','QA','[null,null,null,null,null,null,null]'::jsonb
from bp;

create function pg_temp.as_player(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
$$;

set local role authenticated;

-- Everyone posts in court chat and checks in.
select pg_temp.as_player(a) from bp;
insert into public.court_messages (court_id, user_id, body) select court_id, a, 'from A' from bp;
select public.check_in(court_id, 120) from bp;
select pg_temp.as_player(b) from bp;
insert into public.court_messages (court_id, user_id, body) select court_id, b, 'from B' from bp;
select public.check_in(court_id, 120) from bp;
select pg_temp.as_player(c) from bp;
insert into public.court_messages (court_id, user_id, body) select court_id, c, 'from C' from bp;

-- A blocks B. Can't block as someone else, can't block yourself, can't block twice.
select pg_temp.as_player(a) from bp;
insert into public.player_blocks (blocked_id) select b from bp;
do $$ begin
  if (select blocker_id from public.player_blocks) is distinct from (select a from bp) then
    raise exception 'Blocker was not set to the signed-in player';
  end if;
  begin
    insert into public.player_blocks (blocker_id, blocked_id) select c, b from bp;
    raise exception 'Blocked as another player';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.player_blocks (blocked_id) select a from bp;
    raise exception 'Blocked yourself';
  exception when check_violation then null; end;
  begin
    insert into public.player_blocks (blocked_id) select b from bp;
    raise exception 'Blocked the same player twice';
  exception when unique_violation then null; end;
end $$;

-- A no longer sees B's message, still sees C's and their own.
do $$ begin
  if exists (select 1 from public.court_messages where body = 'from B') then
    raise exception 'Blocker still sees blocked player''s message';
  end if;
  if not exists (select 1 from public.court_messages where body = 'from C') then
    raise exception 'Blocker lost other players'' messages';
  end if;
  if not exists (select 1 from public.court_messages where body = 'from A') then
    raise exception 'Blocker lost their own message';
  end if;
end $$;

-- B doesn't see A's messages either, and can't see that A blocked them.
select pg_temp.as_player(b) from bp;
do $$ declare n int; begin
  if exists (select 1 from public.court_messages where body = 'from A') then
    raise exception 'Blocked player still sees the blocker''s message';
  end if;
  if not exists (select 1 from public.court_messages where body = 'from B') then
    raise exception 'Blocked player lost their own message';
  end if;
  if exists (select 1 from public.player_blocks) then
    raise exception 'Blocked player can see who blocked them';
  end if;
  delete from public.player_blocks; get diagnostics n = row_count;
  if n <> 0 then raise exception 'Blocked player removed the block'; end if;
end $$;

-- C (not involved) still sees everything.
select pg_temp.as_player(c) from bp;
do $$ begin
  if (select count(*) from public.court_messages where body in ('from A','from B','from C')) <> 3 then
    raise exception 'Bystander lost messages because of someone else''s block';
  end if;
end $$;

-- Got next: A starts a team and can't pull B onto it while blocked. After unblocking, it works.
select pg_temp.as_player(a) from bp;
select public.start_team(court_id) from bp;
do $$ begin
  begin
    perform public.add_free_agent((select b from bp));
    raise exception 'Captain added a blocked player';
  exception when raise_exception then if sqlerrm not like 'You can''t add%' then raise; end if; end;
end $$;
delete from public.player_blocks where blocked_id = (select b from bp);
select public.add_free_agent(b) from bp;
do $$ begin
  if not exists (select 1 from public.court_messages where body = 'from B') then
    raise exception 'Unblocking did not bring messages back';
  end if;
end $$;

-- Signed-out visitors can't touch blocks.
reset role;
set local role anon;
do $$ begin
  begin
    perform 1 from public.player_blocks limit 1;
    raise exception 'Signed-out visitor can read blocks';
  exception when insufficient_privilege then null; end;
end $$;

-- Deleting an account deletes blocks made by and against that player.
reset role;
insert into public.player_blocks (blocker_id, blocked_id) select a, c from bp;
insert into public.player_blocks (blocker_id, blocked_id) select c, b from bp;
delete from auth.users where id = (select c from bp);
do $$ begin
  if exists (select 1 from public.player_blocks where blocker_id = (select c from bp) or blocked_id = (select c from bp)) then
    raise exception 'Deleted account left blocks behind';
  end if;
end $$;

rollback;
select 'PASS: block sets self as blocker, no impersonation, no self-block, no duplicates, chat hidden both ways, blocked player cannot see or undo block, bystanders unaffected, captain cannot add blocked player, unblock restores, signed-out blocked, account delete; nothing kept' as test_result;
