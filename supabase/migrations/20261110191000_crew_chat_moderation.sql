-- Crew and run threads share crew_messages and the same moderation controls.
create table public.crew_message_reports (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.crew_messages(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  emailed_at timestamptz,
  unique (message_id, reporter_id)
);
create index crew_message_reports_reporter_idx on public.crew_message_reports(reporter_id, created_at desc);
alter table public.crew_message_reports enable row level security;
revoke all on public.crew_message_reports from public, anon, authenticated;
grant select (message_id) on public.crew_message_reports to authenticated;
grant select, update (emailed_at) on public.crew_message_reports to service_role;
create policy crew_message_reports_read_own on public.crew_message_reports for select to authenticated
  using (reporter_id = (select auth.uid()));

alter policy messages_read on public.crew_messages
  using (
    private.is_crew_member(crew_id)
    and (user_id = (select auth.uid()) or not private.blocked_between((select auth.uid()), user_id))
    and not exists (
      select 1 from public.crew_message_reports r where r.message_id = crew_messages.id
    )
  );

create trigger filter_crew_chat before insert on public.crew_messages
  for each row execute function private.filter_court_chat();

-- Write only through a narrow membership-checked function so clients cannot
-- spoof the reporter, choose email destinations, or edit a moderation record.
create function private.file_crew_message_report(p_message_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  reporter uuid := auth.uid();
  report_id uuid;
begin
  if reporter is null or not exists (
    select 1 from public.crew_messages m
    where m.id = p_message_id
      and m.user_id <> reporter
      and private.is_crew_member(m.crew_id)
      and not private.blocked_between(reporter, m.user_id)
  ) then
    raise exception 'This message is unavailable for reporting.' using errcode = '42501';
  end if;

  -- Keep retries idempotent and enforce the quota across simultaneous requests.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('crew-message-report:' || reporter::text, 0));
  if exists (
    select 1 from public.crew_message_reports r where r.message_id = p_message_id and r.reporter_id = reporter
  ) then
    return;
  end if;
  if (
    select count(*) from public.crew_message_reports r
    where r.reporter_id = reporter and r.created_at > now() - interval '1 hour'
  ) >= 10 then
    raise exception 'Report limit reached. Try again later or email support@runback.net.';
  end if;

  insert into public.crew_message_reports (message_id, reporter_id)
    values (p_message_id, reporter) returning id into report_id;
  perform net.http_post(
    url := 'https://ioxmdthiblgudygedjmc.supabase.co/functions/v1/send-alerts',
    body := jsonb_build_object('crew_message_report_id', report_id),
    headers := jsonb_build_object('Content-Type', 'application/json'),
    timeout_milliseconds := 5000
  );
end $$;
revoke all on function private.file_crew_message_report(uuid) from public, anon, authenticated;
grant execute on function private.file_crew_message_report(uuid) to authenticated;

create function public.report_crew_message(p_message_id uuid) returns void
language sql security invoker set search_path = '' as $$
  select private.file_crew_message_report(p_message_id);
$$;
revoke all on function public.report_crew_message(uuid) from public, anon, authenticated;
grant execute on function public.report_crew_message(uuid) to authenticated;

create function public.crew_message_report_details(p_report_id uuid)
returns table (message_id uuid, crew_id uuid, crew_name text, run_id uuid, run_title text,
               body text, posted_at timestamptz, author_id uuid, author_name text)
language sql stable security invoker set search_path = '' as $$
  select m.id, c.id, c.name, m.run_id, run.title, m.body, m.created_at, m.user_id, p.display_name
  from public.crew_message_reports report
  join public.crew_messages m on m.id = report.message_id
  join public.crews c on c.id = m.crew_id
  join public.profiles p on p.id = m.user_id
  left join public.runs run on run.id = m.run_id
  where report.id = p_report_id and report.emailed_at is null
    and report.created_at > now() - interval '24 hours';
$$;
revoke all on function public.crew_message_report_details(uuid) from public, anon, authenticated;
grant execute on function public.crew_message_report_details(uuid) to service_role;
