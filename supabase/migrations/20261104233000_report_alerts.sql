-- ============ REPORT ALERT EMAILS ============
-- Emails us when someone reports a court chat message, so reports don't sit unseen.
-- One email on a message's 1st report, and one more when it hits 3 (that's when it's hidden for everyone).
-- That way one person reporting a lot can't flood the inbox with emails about the same message.
--
-- The email is sent by the send-alerts edge function through Resend. It needs these
-- Supabase secrets (Edge Functions → Secrets):
--   RESEND_API_KEY   (required; sending-only key from Resend)
--   REPORT_ALERT_TO  (optional; comma-separated emails. Default: support@runback.net)

create table public.report_alert_queue (
  id uuid primary key default gen_random_uuid(),
  -- Deleted with the message (messages clear after 24 hours).
  message_id uuid not null references public.court_messages on delete cascade,
  report_count int not null,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (message_id, report_count)
);
alter table public.report_alert_queue enable row level security;
-- No player access at all; only the server (service_role) reads it.
revoke all on public.report_alert_queue from public, anon, authenticated;
grant all on public.report_alert_queue to service_role;

-- After a report: queue an email on the 1st and 3rd report, then poke send-alerts.
create function private.queue_report_alert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  n int;
  alert_id uuid;
begin
  select count(*) into n from public.court_message_reports where message_id = new.message_id;
  if n not in (1, 3) then return null; end if;
  insert into public.report_alert_queue (message_id, report_count)
    values (new.message_id, n)
    on conflict (message_id, report_count) do nothing
    returning id into alert_id;
  if alert_id is null then return null; end if;
  perform net.http_post(
    url := 'https://ioxmdthiblgudygedjmc.supabase.co/functions/v1/send-alerts',
    body := jsonb_build_object('report_alert_id', alert_id),
    headers := jsonb_build_object('Content-Type', 'application/json'),
    timeout_milliseconds := 5000
  );
  return null;
end $$;
revoke all on function private.queue_report_alert() from public, anon, authenticated;
create trigger queue_report_alert after insert on public.court_message_reports
  for each row execute function private.queue_report_alert();

-- What the email says. Marks the alert as handled so calling twice sends nothing extra.
-- Only the server can call this.
create function public.report_alert_details(p_alert_id uuid)
returns table (
  message_id uuid, report_count int, body text, posted_at timestamptz,
  author_id uuid, author_name text, court_name text, court_slug text
)
language plpgsql security invoker set search_path = '' as $$
declare
  a public.report_alert_queue;
begin
  update public.report_alert_queue set processed_at = now()
    where id = p_alert_id and processed_at is null and created_at > now() - interval '1 hour'
    returning * into a;
  if a.id is null then return; end if;
  return query
    select m.id, a.report_count, m.body, m.created_at, m.user_id, p.display_name, c.name, c.slug
    from public.court_messages m
    join public.profiles p on p.id = m.user_id
    join public.courts c on c.id = m.court_id
    where m.id = a.message_id;
end $$;
revoke all on function public.report_alert_details(uuid) from public, anon, authenticated;
grant execute on function public.report_alert_details(uuid) to service_role;
