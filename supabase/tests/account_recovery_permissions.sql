-- Run in the shared project's SQL editor. No requests or emails are retained.
begin;
set local role anon;
insert into public.account_recovery_requests (display_name, contact_email, details)
values ('Recovery permission test', 'recovery-test@example.invalid', 'Disposable permission test; do not contact.');
do $$begin
  begin
    perform contact_email from public.account_recovery_requests;
    raise exception 'Anonymous users must not read recovery requests';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.account_recovery_requests (display_name, contact_email, details, created_at)
    values ('Forged timestamp', 'recovery-test@example.invalid', 'Disposable permission test.', now() - interval '2 days');
    raise exception 'Anonymous users must not set timestamps';
  exception when insufficient_privilege then null; end;
end$$;
reset role;
set local role authenticated;
insert into public.account_recovery_requests (display_name, contact_email, details)
values ('Recovery permission test', 'recovery-test@example.invalid', 'Disposable permission test; do not contact.');
do $$begin
  begin
    perform contact_email from public.account_recovery_requests;
    raise exception 'Players must not read recovery requests';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.account_recovery_requests;
    raise exception 'Players must not delete recovery requests';
  exception when insufficient_privilege then null; end;
end$$;
insert into public.account_recovery_requests (display_name, contact_email, details)
values ('Recovery permission test', 'RECOVERY-TEST@example.invalid', 'Disposable permission test; do not contact.');
insert into public.account_recovery_requests (display_name, contact_email, details)
values ('Recovery permission test', 'recovery-test@example.invalid', 'Fourth request must be silently suppressed.');
reset role;
do $$begin
  if (select count(*) from public.account_recovery_requests where contact_email='recovery-test@example.invalid') <> 3 then
    raise exception 'Expected three normalized requests and silent duplicate suppression';
  end if;
end$$;
rollback;
select 'Recovery permissions, protected columns, normalization and rate limit passed' as result;
