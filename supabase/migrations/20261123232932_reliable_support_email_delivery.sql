begin;
-- A lookup must not consume a message. The sender records acceptance only after
-- Resend succeeds; its stable idempotency key protects overlapping retries.
create or replace function public.report_alert_details(p_alert_id uuid)
returns table (message_id uuid, report_count int, body text, posted_at timestamptz,
  author_id uuid, author_name text, court_name text, court_slug text)
language sql stable security invoker set search_path = '' as $$
  select m.id, a.report_count, m.body, m.created_at, m.user_id, p.display_name, c.name, c.slug
  from public.report_alert_queue a
  join public.court_messages m on m.id = a.message_id
  join public.profiles p on p.id = m.user_id
  join public.courts c on c.id = m.court_id
  where a.id = p_alert_id and a.processed_at is null
    and a.created_at > now() - interval '23 hours';
$$;

create or replace function public.feedback_email_details(p_feedback_id uuid)
returns table (feedback_id uuid, message text, page text, sent_at timestamptz,
  player_id uuid, player_name text, reply_email text)
language sql stable security definer set search_path = '' as $$
  select f.id, f.message, f.page, f.created_at, f.user_id, p.display_name, u.email::text
  from public.feedback f
  left join public.profiles p on p.id = f.user_id
  left join auth.users u on u.id = f.user_id
  where f.id = p_feedback_id and f.emailed_at is null
    and f.created_at > now() - interval '23 hours';
$$;

-- All retry windows remain shorter than Resend's 24-hour idempotency lifetime.
create or replace function public.crew_message_report_details(p_report_id uuid)
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
    and report.created_at > now() - interval '23 hours';
$$;

revoke all on function public.report_alert_details(uuid), public.feedback_email_details(uuid),
  public.crew_message_report_details(uuid) from public, anon, authenticated;
grant execute on function public.report_alert_details(uuid), public.feedback_email_details(uuid),
  public.crew_message_report_details(uuid) to service_role;

-- Index the small pending queues, and retry bounded batches every five minutes.
create index feedback_pending_email on public.feedback(created_at) where emailed_at is null;
create index report_pending_email on public.report_alert_queue(created_at) where processed_at is null;
create index crew_report_pending_email on public.crew_message_reports(created_at) where emailed_at is null;
create function private.retry_support_emails() returns void
language plpgsql security definer set search_path = '' as $$
declare item record;
begin
  for item in
    select jsonb_build_object('feedback_id', id) as payload from (
      select id from public.feedback where emailed_at is null
        and created_at > now() - interval '23 hours' and created_at < now() - interval '2 minutes'
      order by created_at desc limit 20
    ) f
    union all
    select jsonb_build_object('report_alert_id', id) from (
      select id from public.report_alert_queue where processed_at is null
        and created_at > now() - interval '23 hours' and created_at < now() - interval '2 minutes'
      order by created_at desc limit 20
    ) c
    union all
    select jsonb_build_object('crew_message_report_id', id) from (
      select id from public.crew_message_reports where emailed_at is null
        and created_at > now() - interval '23 hours' and created_at < now() - interval '2 minutes'
      order by created_at desc limit 20
    ) r
  loop
    perform net.http_post(
      url := 'https://ioxmdthiblgudygedjmc.supabase.co/functions/v1/send-alerts',
      body := item.payload,
      headers := jsonb_build_object('Content-Type', 'application/json'), timeout_milliseconds := 5000
    );
  end loop;
end;
$$;
revoke all on function private.retry_support_emails() from public, anon, authenticated;
select cron.schedule('runback-retry-support-emails', '*/5 * * * *', 'select private.retry_support_emails()');
commit;
