-- Court chat permission test. Runs against the real project and is fully rolled back:
-- the 4 temporary players, their messages, and reports are never kept.
begin;

create temp table cc as
select gen_random_uuid() a, gen_random_uuid() b, gen_random_uuid() c, gen_random_uuid() d,
       (select id from public.courts order by sort_order limit 1) court_id;
alter table cc enable row level security;
create policy test_context_read on cc for select to authenticated, anon using (true);
grant select on cc to authenticated, anon;

insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
select v.id, 'authenticated', 'authenticated', 'court-chat-test-' || v.n || '@example.invalid',
       jsonb_build_object('display_name', 'Court test ' || v.n), now(), now()
from cc, lateral (values (cc.a, 1), (cc.b, 2), (cc.c, 3), (cc.d, 4)) v(id, n);

set local role authenticated;

-- Player A posts. Message is trimmed; spam, impersonation, hidden flag, and edits are blocked.
select set_config('request.jwt.claims', json_build_object('sub', (select a from cc), 'role', 'authenticated')::text, true);
insert into public.court_messages (court_id, user_id, body) select court_id, a, '  Run at 6?  ' from cc;
do $$ begin
  if (select body from public.court_messages where user_id = (select a from cc)) is distinct from 'Run at 6?' then
    raise exception 'Message was not trimmed';
  end if;
  begin
    insert into public.court_messages (court_id, user_id, body) select court_id, a, 'again' from cc;
    raise exception 'Spam limit missing';
  exception when raise_exception then if sqlerrm not like 'Wait%' then raise; end if; end;
  begin
    insert into public.court_messages (court_id, user_id, body) select court_id, b, 'pretending' from cc;
    raise exception 'Posted as another player';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.court_messages (court_id, user_id, body, hidden) select court_id, a, 'sneaky', true from cc;
    raise exception 'Set the hidden flag directly';
  exception when insufficient_privilege then null; end;
  begin
    update public.court_messages set body = 'edited' where user_id = (select a from cc);
    raise exception 'Edited a message';
  exception when insufficient_privilege then null; end;
end $$;

-- Player B sees it, can't delete it or report as someone else, reports it, then no longer sees it.
select set_config('request.jwt.claims', json_build_object('sub', (select b from cc), 'role', 'authenticated')::text, true);
do $$ declare n int; begin
  if not exists (select 1 from public.court_messages where body = 'Run at 6?') then
    raise exception 'Signed-in player cannot see court chat';
  end if;
  delete from public.court_messages where body = 'Run at 6?'; get diagnostics n = row_count;
  if n <> 0 then raise exception 'Deleted someone else''s message'; end if;
  begin
    insert into public.court_message_reports (message_id, reporter_id)
    select id, (select c from cc) from public.court_messages where body = 'Run at 6?';
    raise exception 'Reported as another player';
  exception when insufficient_privilege then null; end;
  insert into public.court_message_reports (message_id, reporter_id)
  select id, auth.uid() from public.court_messages where body = 'Run at 6?';
  if exists (select 1 from public.court_messages where body = 'Run at 6?') then
    raise exception 'Reporter still sees the reported message';
  end if;
end $$;

-- Player C still sees it (1 report), posts and removes their own message, then reports A's.
select set_config('request.jwt.claims', json_build_object('sub', (select c from cc), 'role', 'authenticated')::text, true);
insert into public.court_messages (court_id, user_id, body) select court_id, c, 'Pulling up' from cc;
do $$ declare n int; begin
  if not exists (select 1 from public.court_messages where body = 'Run at 6?') then
    raise exception 'One report hid the message for everyone';
  end if;
  delete from public.court_messages where body = 'Pulling up'; get diagnostics n = row_count;
  if n <> 1 then raise exception 'Could not delete own message'; end if;
  insert into public.court_message_reports (message_id, reporter_id)
  select id, auth.uid() from public.court_messages where body = 'Run at 6?';
end $$;

-- Player D reports it too (3rd report) and posts a message we'll age past 24 hours.
select set_config('request.jwt.claims', json_build_object('sub', (select d from cc), 'role', 'authenticated')::text, true);
insert into public.court_message_reports (message_id, reporter_id)
select id, auth.uid() from public.court_messages where body = 'Run at 6?';
insert into public.court_messages (court_id, user_id, body) select court_id, d, 'Old news' from cc;

-- Author A no longer sees it: 3 reports hide it for everyone.
select set_config('request.jwt.claims', json_build_object('sub', (select a from cc), 'role', 'authenticated')::text, true);
do $$ begin
  if exists (select 1 from public.court_messages where body = 'Run at 6?') then
    raise exception '3 reports did not hide the message';
  end if;
end $$;

-- Signed-out visitors can't read court chat at all.
reset role;
set local role anon;
do $$ begin
  begin
    perform 1 from public.court_messages limit 1;
    raise exception 'Signed-out visitor can read court chat';
  exception when insufficient_privilege then null; end;
end $$;

-- Messages older than 24 hours are invisible, and the hourly cleanup deletes them.
reset role;
update public.court_messages set created_at = now() - interval '25 hours' where user_id = (select d from cc);
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select a from cc), 'role', 'authenticated')::text, true);
do $$ begin
  if exists (select 1 from public.court_messages where body = 'Old news') then
    raise exception 'Message older than 24 hours is still visible';
  end if;
end $$;
reset role;
delete from public.court_messages where created_at < now() - interval '24 hours';
do $$ begin
  if exists (select 1 from public.court_messages where body = 'Old news') then
    raise exception 'Cleanup did not delete old message';
  end if;
  if not exists (select 1 from cron.job where jobname = 'delete-old-court-messages') then
    raise exception 'Cleanup job is not scheduled';
  end if;
end $$;

-- Deleting an account deletes that player's court messages and reports.
delete from auth.users where id = (select a from cc);
delete from auth.users where id = (select b from cc);
do $$ begin
  if exists (select 1 from public.court_messages where user_id = (select a from cc)) then
    raise exception 'Deleted account left court messages behind';
  end if;
  if exists (select 1 from public.court_message_reports where reporter_id = (select b from cc)) then
    raise exception 'Deleted account left reports behind';
  end if;
end $$;

rollback;
select 'PASS: court chat trims, spam limit, no impersonation, no edits, own delete only, report hides for reporter, 3 reports hide for all, signed-out blocked, 24h expiry + cleanup, account delete; nothing kept' as test_result;
