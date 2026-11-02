-- Privacy: delete-my-account, a feedback inbox, and 30-day check-in history.

-- Deletes the signed-in player's account and everything tied to it:
-- profile, check-ins, favorites, alert devices, crew memberships, and crews they started.
-- (Their photo is removed by the app through the Storage API first.)
create function public.delete_my_account()
returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Sign in first'; end if;
  delete from auth.users where id = uid;
end;
$$;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- Messages players send from the app. The team reads them in the Supabase dashboard.
create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  message text not null check (char_length(trim(message)) between 1 and 2000),
  page text check (char_length(page) <= 200),
  created_at timestamptz not null default now()
);
alter table public.feedback enable row level security;
create policy "Players can send feedback" on public.feedback
  for insert to authenticated
  with check ((select auth.uid()) = user_id);
grant insert on public.feedback to authenticated;
revoke all on public.feedback from anon;

-- Keep at most 5 messages per player per hour so nobody can flood the inbox.
create function private.limit_feedback()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.feedback
      where user_id = new.user_id and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Thanks! You''ve sent a few messages already. Try again in a bit.';
  end if;
  return new;
end;
$$;
create trigger feedback_limit
  before insert on public.feedback
  for each row execute function private.limit_feedback();

-- Check-in history (where and when someone played) is deleted after 30 days.
create extension if not exists pg_cron;
select cron.schedule(
  'delete-old-checkins',
  '17 10 * * *', -- daily at 3:17 AM Tucson time
  $$delete from public.checkins where expires_at < now() - interval '30 days'$$
);

-- Players can only send messages, never read them back.
revoke select, update, delete, truncate, references, trigger on public.feedback from authenticated;
