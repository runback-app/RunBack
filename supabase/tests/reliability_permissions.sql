-- Disposable, rolled back. HTTP requests stay in the transaction and never send.
begin;
create temp table reliability_context as
select c.id crew_id,c.created_by owner_id,m.user_id member_id,c.court_id
from public.crews c join public.crew_members m on m.crew_id=c.id and m.user_id<>c.created_by
where c.court_id is not null limit 1;
grant select on reliability_context to authenticated, service_role;
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',(select owner_id from reliability_context),'role','authenticated')::text,true);
insert into public.run_series(crew_id,court_id,title,weekdays,local_time,starts_on)
select crew_id,court_id,'QA reliable series',array[0,1,2,3,4,5,6],'18:00',current_date+1 from reliability_context;
-- Cancel one date only.
update public.runs set cancelled=true where id=(select id from public.runs where title='QA reliable series' order by starts_at limit 1);
do $$ begin
 if (select count(*) from public.runs where title='QA reliable series' and cancelled)<>1 then raise exception 'Single-date cancellation affected other dates'; end if;
end $$;
reset role;
select private.materialize_runs();
do $$ begin
 if (select count(*) from public.runs where title='QA reliable series' and cancelled)<>1 then raise exception 'Scheduler resurrected cancelled date'; end if;
end $$;
-- A member cannot stop another person's schedule or update their run.
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',(select member_id from reliability_context),'role','authenticated')::text,true);
do $$ declare n int; begin
 update public.run_series set active=false where title='QA reliable series'; get diagnostics n=row_count;
 if n<>0 then raise exception 'Member stopped schedule'; end if;
 update public.runs set cancelled=true where title='QA reliable series'; get diagnostics n=row_count;
 if n<>0 then raise exception 'Member cancelled date'; end if;
end $$;
select set_config('request.jwt.claims',json_build_object('sub',(select owner_id from reliability_context),'role','authenticated')::text,true);
update public.run_series set active=false where title='QA reliable series';
reset role;
select private.materialize_runs();
do $$ begin
 if exists(select 1 from public.runs where title='QA reliable series' and not cancelled) then raise exception 'Stopped schedule left active dates'; end if;
end $$;

-- Device registration is private, validates tokens, and supports shared phones.
set local role authenticated;
select public.save_native_push_subscription(repeat('a',64),'sandbox');
do $$ begin
 if not exists(select 1 from public.push_subscriptions where endpoint='apns://sandbox/'||repeat('a',64)) then raise exception 'Native device missing'; end if;
 begin perform public.save_native_push_subscription('invalid','production'); raise exception 'Invalid token accepted'; exception when raise_exception then
   if sqlerrm='Invalid token accepted' then raise; end if;
 end;
end $$;
select set_config('request.jwt.claims',json_build_object('sub',(select member_id from reliability_context),'role','authenticated')::text,true);
do $$ declare n int; begin
 if exists(select 1 from public.push_subscriptions where endpoint='apns://sandbox/'||repeat('a',64)) then raise exception 'Another player can see device'; end if;
 delete from public.push_subscriptions where endpoint='apns://sandbox/'||repeat('a',64); get diagnostics n=row_count;
 if n<>0 then raise exception 'Another player removed device'; end if;
end $$;
select public.save_native_push_subscription(repeat('a',64),'sandbox');
reset role;
do $$ begin
 if (select user_id from public.push_subscriptions where endpoint='apns://sandbox/'||repeat('a',64))<>(select member_id from reliability_context) then raise exception 'Shared phone did not switch accounts'; end if;
end $$;
set local role anon;
do $$ begin
 begin perform public.save_native_push_subscription(repeat('b',64),'production'); raise exception 'Visitor registered push'; exception when insufficient_privilege then null; end;
 begin perform public.report_alert_details(gen_random_uuid()); raise exception 'Visitor read reports'; exception when insufficient_privilege then null; end;
 begin perform public.crew_message_report_details(gen_random_uuid()); raise exception 'Visitor read private reports'; exception when insufficient_privilege then null; end;
end $$;
reset role;
-- Read-only report lookups and automatic retries use pending records only.
insert into public.court_messages(court_id,user_id,body)
select court_id,owner_id,'QA report retry' from reliability_context;
insert into public.report_alert_queue(message_id,report_count,created_at)
select id,1,now()-interval '3 minutes' from public.court_messages where body='QA report retry';
set local role service_role;
do $$ declare rid uuid := (select id from public.report_alert_queue order by created_at limit 1); n int; begin
 select count(*) into n from public.report_alert_details(rid);
 if n<>1 then raise exception 'Pending report missing'; end if;
 select count(*) into n from public.report_alert_details(rid);
 if n<>1 then raise exception 'Lookup consumed unsent report'; end if;
 update public.report_alert_queue set processed_at=now() where id=rid;
 select count(*) into n from public.report_alert_details(rid);
 if n<>0 then raise exception 'Delivered report remained pending'; end if;
end $$;
reset role;
insert into public.feedback(user_id,message,created_at) select owner_id,'QA retry queue',now()-interval '3 minutes' from reliability_context;
do $$ declare before_n int; begin
 select count(*) into before_n from net.http_request_queue;
 perform private.retry_support_emails();
 if (select count(*) from net.http_request_queue)<=before_n then raise exception 'Retry did not queue pending feedback'; end if;
end $$;
rollback;
