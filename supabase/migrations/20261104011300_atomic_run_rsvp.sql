-- PostgREST upsert also tries to update the immutable run/user keys. Keep
-- column-level grants narrow and expose a single atomic, caller-owned write.
create or replace function public.set_run_rsvp(
  p_run_id uuid,
  p_status text,
  p_reminder boolean default true
) returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in to save attendance.' using errcode = '42501';
  end if;
  insert into public.run_rsvps(run_id,user_id,status,reminder,updated_at)
  values(p_run_id,auth.uid(),p_status,p_reminder,now())
  on conflict (run_id,user_id) do update
  set status=excluded.status,reminder=excluded.reminder,updated_at=now();
end;
$$;
revoke all on function public.set_run_rsvp(uuid,text,boolean) from public,anon;
grant execute on function public.set_run_rsvp(uuid,text,boolean) to authenticated;
