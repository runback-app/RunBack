-- ============ COURT CHAT ============
-- One open chat per court so players can rally a run ("anyone pulling up at 6?").
-- Signed-in players only. Messages clear after 24 hours.
-- Anyone can report a message: it disappears for them right away, and for everyone after 3 reports.

create table public.court_messages (
  id uuid primary key default gen_random_uuid(),
  court_id uuid not null references public.courts on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 500),
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index court_messages_court_idx on public.court_messages(court_id, created_at desc);
create index court_messages_user_idx on public.court_messages(user_id, created_at desc);

create table public.court_message_reports (
  message_id uuid not null references public.court_messages on delete cascade,
  reporter_id uuid not null references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key (message_id, reporter_id)
);
create index court_message_reports_reporter_idx on public.court_message_reports(reporter_id);

alter table public.court_messages enable row level security;
alter table public.court_message_reports enable row level security;

-- Read: last 24 hours, not hidden by reports, and not something you reported yourself.
create policy court_messages_read on public.court_messages for select to authenticated
  using (
    created_at > now() - interval '24 hours'
    and not hidden
    and not exists (
      select 1 from public.court_message_reports r
      where r.message_id = court_messages.id and r.reporter_id = (select auth.uid())
    )
  );
create policy court_messages_insert on public.court_messages for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy court_messages_delete on public.court_messages for delete to authenticated
  using (user_id = (select auth.uid()));

create policy court_reports_insert on public.court_message_reports for insert to authenticated
  with check (reporter_id = (select auth.uid()));
create policy court_reports_read_own on public.court_message_reports for select to authenticated
  using (reporter_id = (select auth.uid()));

-- Only the columns the app needs. Nobody can edit a message or set `hidden` themselves.
revoke all on public.court_messages, public.court_message_reports from anon, authenticated;
grant select, delete on public.court_messages to authenticated;
grant insert (court_id, user_id, body) on public.court_messages to authenticated;
grant select on public.court_message_reports to authenticated;
grant insert (message_id, reporter_id) on public.court_message_reports to authenticated;
grant all on public.court_messages, public.court_message_reports to service_role;

-- Spam limits: one message every 5 seconds, 30 an hour.
create function private.limit_court_chat() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('court_chat:' || new.user_id::text, 0));
  if exists (select 1 from public.court_messages
             where user_id = new.user_id and created_at > now() - interval '5 seconds') then
    raise exception 'Wait a few seconds before sending another message';
  end if;
  if (select count(*) from public.court_messages
      where user_id = new.user_id and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'Message limit reached. Try again later';
  end if;
  new.body := trim(new.body);
  new.hidden := false;
  new.created_at := now();
  return new;
end $$;
revoke all on function private.limit_court_chat() from public, anon, authenticated;
create trigger limit_court_chat before insert on public.court_messages
  for each row execute function private.limit_court_chat();

-- Hide a message for everyone once 3 different players report it.
create function private.hide_reported_court_message() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.court_message_reports where message_id = new.message_id) >= 3 then
    update public.court_messages set hidden = true where id = new.message_id;
  end if;
  return null;
end $$;
revoke all on function private.hide_reported_court_message() from public, anon, authenticated;
create trigger hide_reported_court_message after insert on public.court_message_reports
  for each row execute function private.hide_reported_court_message();

-- Clear messages (and their reports) once they're a day old. Runs hourly.
select cron.schedule(
  'delete-old-court-messages',
  '23 * * * *',
  $$delete from public.court_messages where created_at < now() - interval '24 hours'$$
);
