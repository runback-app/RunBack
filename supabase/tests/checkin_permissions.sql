-- Fully rolled back, including queued HTTP calls: never changes live counts or
-- sends notifications. Uses two disposable courts and players.
begin;
create temp table checkin_test as
select gen_random_uuid() a,gen_random_uuid() b,gen_random_uuid() court_a,gen_random_uuid() court_b;
alter table checkin_test enable row level security;
create policy test_context_read on checkin_test for select to authenticated,anon using(true);
grant select on checkin_test to authenticated,anon;
insert into auth.users(id,aud,role,email,raw_user_meta_data,created_at,updated_at)
select v.id,'authenticated','authenticated',v.id::text||'@example.invalid',
  jsonb_build_object('display_name','Check-in permission test'),now(),now()
from checkin_test,lateral(values(a),(b)) v(id);
insert into public.courts(id,slug,name,kind,area,address,hours)
select v.id,'qa-'||v.id::text,'Disposable QA court','outdoor','QA','QA',
  '[null,null,null,null,null,null,null]'::jsonb
from checkin_test,lateral(values(court_a),(court_b)) v(id);

set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',(select a from checkin_test),'role','authenticated')::text,true);
select public.check_in(court_a,60) from checkin_test;
do $$begin
  if (select count(*) from public.checkins where user_id=auth.uid())<>1 then raise exception 'Missing own check-in';end if;
  if (select players from public.court_activity() where court_id=(select court_a from checkin_test))<>1 then raise exception 'Public count incorrect';end if;
  begin
    perform public.check_in((select court_a from checkin_test),0);
    raise exception 'Invalid duration accepted';
  exception when raise_exception then if sqlerrm not like 'Check-ins last%' then raise;end if;end;
  begin
    insert into public.checkins(court_id,user_id,expires_at)
    select court_a,b,now()+interval '1 hour' from checkin_test;
    raise exception 'Could impersonate another check-in';
  exception when insufficient_privilege then null;end;
end$$;
-- A second check-in moves the player; the old one no longer appears.
select public.check_in(court_b,120) from checkin_test;
do $$begin
  if (select count(*) from public.checkins where user_id=auth.uid())<>1 then raise exception 'Player appears at multiple courts';end if;
  if exists(select 1 from public.court_activity() where court_id=(select court_a from checkin_test)) then raise exception 'Previous court count stayed active';end if;
end$$;
select set_config('request.jwt.claims',json_build_object('sub',(select b from checkin_test),'role','authenticated')::text,true);
select public.check_out();
do $$begin
  if not exists(select 1 from public.checkins where user_id=(select a from checkin_test)) then raise exception 'Other player could end my check-in';end if;
end$$;
select set_config('request.jwt.claims',json_build_object('sub',(select a from checkin_test),'role','authenticated')::text,true);
select public.check_out();
do $$begin if exists(select 1 from public.checkins where user_id=auth.uid()) then raise exception 'Check-out did not remove live check-in';end if;end$$;

-- An expired row is hidden by the database, independent of frontend timers.
reset role;
insert into public.checkins(court_id,user_id,created_at,expires_at)
select court_a,a,now()-interval '2 hours',now()-interval '1 hour' from checkin_test;
set local role authenticated;
do $$begin
  if exists(select 1 from public.checkins where user_id=(select a from checkin_test)) then raise exception 'Expired check-in visible';end if;
end$$;
reset role;
set local role anon;
do $$begin
  if exists(select 1 from public.court_activity() where court_id in(select court_a from checkin_test union select court_b from checkin_test)) then raise exception 'Ended/expired check-in counted';end if;
  begin
    perform 1 from public.checkins;
    raise exception 'Signed-out visitor could read player identities';
  exception when insufficient_privilege then null;end;
  begin
    perform public.check_in((select court_a from checkin_test),60);
    raise exception 'Signed-out visitor could check in';
  exception when insufficient_privilege then null;end;
end$$;
reset role;
do $$begin
  if not exists(select 1 from cron.job where jobname='delete-old-checkins') then raise exception 'History cleanup job missing';end if;
end$$;
rollback;
select 'PASS: own check-in/out, one court at a time, duration bounds, public counts without identities, expiry, anonymous writes blocked, cleanup job; no data or pushes retained' as test_result;
