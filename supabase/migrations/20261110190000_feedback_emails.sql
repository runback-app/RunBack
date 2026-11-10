-- ============ FEEDBACK EMAILS ============
-- Emails us every message sent through the feedback form, so they don't sit unseen in the table.
-- Sent by the send-alerts edge function through Resend (same setup as report emails:
-- RESEND_API_KEY, optional REPORT_ALERT_TO, default support@runback.net).
-- The email's Reply-To is the player's sign-in email, so hitting Reply answers them.

alter table public.feedback add column emailed_at timestamptz;
-- Players still can't read or change anything in this table (insert only).
revoke update on public.feedback from authenticated;

-- After a message lands: poke send-alerts with its id.
create function private.queue_feedback_email() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform net.http_post(
    url := 'https://ioxmdthiblgudygedjmc.supabase.co/functions/v1/send-alerts',
    body := jsonb_build_object('feedback_id', new.id),
    headers := jsonb_build_object('Content-Type', 'application/json'),
    timeout_milliseconds := 5000
  );
  return null;
end $$;
revoke all on function private.queue_feedback_email() from public, anon, authenticated;
create trigger queue_feedback_email after insert on public.feedback
  for each row execute function private.queue_feedback_email();

-- What the email says. Marks the message as emailed so calling twice sends nothing extra.
-- Only the server can call this (it returns the player's email for Reply-To).
create function public.feedback_email_details(p_feedback_id uuid)
returns table (
  feedback_id uuid, message text, page text, sent_at timestamptz,
  player_id uuid, player_name text, reply_email text
)
language plpgsql security definer set search_path = '' as $$
declare
  f public.feedback;
begin
  update public.feedback set emailed_at = now()
    where id = p_feedback_id and emailed_at is null and created_at > now() - interval '1 hour'
    returning * into f;
  if f.id is null then return; end if;
  return query
    select f.id, f.message, f.page, f.created_at, f.user_id, p.display_name, u.email::text
    from (select 1) one
    left join public.profiles p on p.id = f.user_id
    left join auth.users u on u.id = f.user_id;
end $$;
revoke all on function public.feedback_email_details(uuid) from public, anon, authenticated;
grant execute on function public.feedback_email_details(uuid) to service_role;
