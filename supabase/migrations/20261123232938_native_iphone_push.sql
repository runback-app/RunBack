begin;
-- Reuse the existing private device table and all three notification target
-- functions. Only the sender interprets this endpoint as an Apple device token.
create function public.save_native_push_subscription(p_token text, p_environment text)
returns void language plpgsql security definer set search_path = '' as $$
declare player uuid := auth.uid(); target text;
begin
  if player is null then raise exception 'Sign in to turn on alerts'; end if;
  if p_token is null or p_token !~ '^[0-9a-fA-F]{64}$'
    or p_environment is null or p_environment not in ('sandbox', 'production') then
    raise exception 'Invalid Apple notification registration';
  end if;
  target := 'apns://' || p_environment || '/' || lower(p_token);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('native-device:' || player::text, 0));
  if not exists (select 1 from public.push_subscriptions where endpoint = target)
    and (select count(*) from public.push_subscriptions where user_id = player and endpoint like 'apns://%') >= 20 then
    raise exception 'Too many registered devices. Remove an old device first.';
  end if;
  insert into public.push_subscriptions(user_id, endpoint, p256dh, auth)
    values (player, target, '', '')
  on conflict (endpoint) do update set user_id = excluded.user_id;
end;
$$;
revoke all on function public.save_native_push_subscription(text, text) from public, anon;
grant execute on function public.save_native_push_subscription(text, text) to authenticated;
commit;
