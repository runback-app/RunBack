-- Run in the shared project's SQL editor. Everything rolls back; no email is sent.
begin;
do $$
declare
  pid uuid := (select id from public.profiles order by created_at limit 1);
  fid uuid;
  n int;
begin
  if pid is null then raise exception 'Need at least one player to test with'; end if;

  -- A player sends feedback (as themselves).
  perform set_config('request.jwt.claims', json_build_object('sub', pid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.feedback (user_id, message, page) values (pid, 'Feedback email test', '/privacy');

  -- Players can't read feedback, mark it emailed, or call the email lookup.
  begin
    perform 1 from public.feedback;
    raise exception 'Players must not read feedback';
  exception when insufficient_privilege then null; end;
  begin
    update public.feedback set emailed_at = now();
    raise exception 'Players must not change feedback';
  exception when insufficient_privilege then null; end;
  begin
    perform public.feedback_email_details(gen_random_uuid());
    raise exception 'Players must not call feedback_email_details';
  exception when insufficient_privilege then null; end;
  reset role;

  set local role anon;
  begin
    perform public.feedback_email_details(gen_random_uuid());
    raise exception 'Visitors must not call feedback_email_details';
  exception when insufficient_privilege then null; end;
  reset role;

  -- The trigger queued a call to send-alerts.
  select id into fid from public.feedback where user_id = pid and message = 'Feedback email test' order by created_at desc limit 1;
  if not exists (select 1 from net.http_request_queue where convert_from(body, 'UTF8') like '%' || fid || '%') then
    raise exception 'Expected the feedback email to be queued';
  end if;

  -- The server gets the details once, with the player's email for Reply-To.
  set local role service_role;
  select count(*) into n from public.feedback_email_details(fid) d
    where d.message = 'Feedback email test' and d.reply_email is not null;
  if n <> 1 then raise exception 'Expected one email with a reply address, got %', n; end if;
  select count(*) into n from public.feedback_email_details(fid);
  if n <> 0 then raise exception 'Second lookup must return nothing (already emailed)'; end if;
  reset role;
end $$;
rollback;
select 'Feedback email queue, details and permissions passed' as result;
