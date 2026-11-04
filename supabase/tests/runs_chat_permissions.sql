-- Integration test against a project with an existing crew and at least two members.
-- Everything, including queued notification HTTP calls, is rolled back.
begin;
create temp table social_test_context as
select c.id crew_id,c.created_by owner_id,m.user_id member_id,c.court_id
from public.crews c join public.crew_members m on m.crew_id=c.id and m.user_id<>c.created_by
where c.court_id is not null limit 1;
alter table social_test_context enable row level security;
create policy test_context_read on social_test_context for select to authenticated using (true);
grant select on social_test_context to authenticated;
DO $$begin if not exists(select 1 from social_test_context) then raise exception 'Need one crew with a leader and another member'; end if; end$$;
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',(select owner_id from social_test_context),'role','authenticated')::text,true);
insert into public.run_series(crew_id,court_id,title,weekdays,local_time,starts_on)
select crew_id,court_id,'Permission test recurring',array[0,1,2,3,4,5,6],'18:00',current_date+1 from social_test_context;
DO $$begin if (select count(*) from public.runs where title='Permission test recurring')<70 then raise exception 'Recurrence did not create rolling dates'; end if;end$$;
insert into public.runs(crew_id,court_id,title,starts_at)
select crew_id,court_id,'Permission test one-off',now()+interval '20 minutes' from social_test_context;
insert into storage.objects(bucket_id,name)
select 'crew-photos',crew_id::text||'/permission-test.jpg' from social_test_context;
select set_config('request.jwt.claims',json_build_object('sub',(select member_id from social_test_context),'role','authenticated')::text,true);
DO $$begin if not exists(select 1 from storage.objects where bucket_id='crew-photos' and name=(select crew_id::text||'/permission-test.jpg' from social_test_context)) then raise exception 'Member cannot read crew photo';end if;end$$;
select public.set_run_rsvp(id,'going',true) from public.runs where title='Permission test one-off';
select public.set_run_rsvp(id,'maybe',false) from public.runs where title='Permission test one-off';
DO $$begin if not exists(select 1 from public.run_rsvps v join public.runs r on r.id=v.run_id where r.title='Permission test one-off' and v.user_id=auth.uid() and v.status='maybe' and not v.reminder) then raise exception 'RSVP conflict update failed';end if;end$$;
select public.set_run_rsvp(id,'going',true) from public.runs where title='Permission test one-off';
insert into public.crew_messages(crew_id,run_id,user_id,body)
select crew_id,id,(select member_id from social_test_context),'Test run message' from public.runs where title='Permission test one-off';
DO $$declare n integer;begin
 update public.runs set cancelled=true where title='Permission test one-off'; get diagnostics n=row_count;
 if n<>0 then raise exception 'Member could edit leader run'; end if;
 update public.crews set description='unauthorized' where id=(select crew_id from social_test_context); get diagnostics n=row_count;
 if n<>0 then raise exception 'Member could edit crew'; end if;
 begin
 insert into public.run_rsvps(run_id,user_id,status) select id,(select owner_id from social_test_context),'going' from public.runs where title='Permission test one-off';
 raise exception 'Member could impersonate another RSVP'; exception when insufficient_privilege then null;end;
 begin
 insert into storage.objects(bucket_id,name) select 'crew-photos',crew_id::text||'/unauthorized.jpg' from social_test_context;
 raise exception 'Member could upload crew photo'; exception when insufficient_privilege then null;end;
 begin
 update public.run_rsvps set user_id=(select owner_id from social_test_context) where user_id=(select member_id from social_test_context);
 raise exception 'Member could reassign RSVP'; exception when insufficient_privilege then null;end;
end$$;
select set_config('request.jwt.claims',json_build_object('sub',gen_random_uuid(),'role','authenticated')::text,true);
DO $$begin
 if exists(select 1 from public.runs where title like 'Permission test%') then raise exception 'Outsider can read runs'; end if;
 if exists(select 1 from public.crew_messages where body='Test run message') then raise exception 'Outsider can read chat'; end if;
 begin
 insert into public.crew_messages(crew_id,user_id,body) select crew_id,auth.uid(),'Outsider message' from social_test_context;
 raise exception 'Outsider can post chat';exception when insufficient_privilege then null;end;
end$$;
reset role;
select private.queue_run_reminders();
DO $$begin if not exists(select 1 from public.run_notifications n join public.runs r on r.id=n.run_id where r.title='Permission test one-off' and kind='reminder') then raise exception 'Reminder missing';end if;end$$;
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',(select owner_id from social_test_context),'role','authenticated')::text,true);
update public.runs set cancelled=true where title='Permission test one-off';
reset role;
DO $$begin if not exists(select 1 from public.run_notifications n join public.runs r on r.id=n.run_id where r.title='Permission test one-off' and kind='cancelled') then raise exception 'Cancellation notice missing';end if;end$$;
rollback;
select 'PASS: recurrence, own RSVP, chat membership, leader permissions, photo permissions, reminders, cancellation; no test data retained' as test_result;
