-- Public, write-only support inbox. A request is an unverified claim, never an
-- instruction to disclose an email address or change an account.
create table public.account_recovery_requests (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (char_length(trim(display_name)) between 1 and 80),
  contact_email text not null check (
    char_length(contact_email) <= 254 and contact_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  details text not null check (char_length(trim(details)) between 10 and 1000),
  created_at timestamptz not null default now()
);
create index recovery_requests_contact_created on public.account_recovery_requests (contact_email, created_at);
create index recovery_requests_created on public.account_recovery_requests (created_at);
alter table public.account_recovery_requests enable row level security;
revoke all on public.account_recovery_requests from public, anon, authenticated;
grant insert (display_name, contact_email, details) on public.account_recovery_requests to anon, authenticated;
grant all on public.account_recovery_requests to service_role;
create policy "Anyone can request manual account recovery"
  on public.account_recovery_requests for insert to anon, authenticated with check (true);

-- The private trigger can count inbox rows while callers cannot read them.
-- Serialize this small inbox to enforce limits even for concurrent requests.
-- Return the same successful response when a duplicate is suppressed. No query
-- ever matches a request to auth.users or reveals whether an account exists.
create function private.limit_account_recovery_requests()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.contact_email := lower(trim(new.contact_email));
  new.display_name := trim(new.display_name);
  new.details := trim(new.details);
  perform pg_catalog.pg_advisory_xact_lock(742291305);
  if (select count(*) from public.account_recovery_requests
      where contact_email = new.contact_email and created_at > now() - interval '1 hour') >= 3
    or (select count(*) from public.account_recovery_requests
        where created_at > now() - interval '1 hour') >= 100 then
    return null;
  end if;
  return new;
end;
$$;
revoke all on function private.limit_account_recovery_requests() from public, anon, authenticated;
create trigger account_recovery_request_limit before insert on public.account_recovery_requests
  for each row execute function private.limit_account_recovery_requests();

-- Keep sensitive support information only as long as the privacy page promises.
select cron.schedule('delete-old-account-recovery-requests', '29 10 * * *',
  $$delete from public.account_recovery_requests where created_at < now() - interval '30 days'$$);
