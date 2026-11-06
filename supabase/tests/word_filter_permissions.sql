-- Word filter. Fully rolled back: the temporary player and messages are never kept.
begin;
create temp table wf as select gen_random_uuid() a, (select id from public.courts order by sort_order limit 1) court_id;
alter table wf enable row level security;
create policy wf_read on wf for select to authenticated, anon using (true);
grant select on wf to authenticated, anon;

-- A bad name at signup becomes "Player" (plus numbers if taken).
insert into auth.users(id,aud,role,email,raw_user_meta_data,created_at,updated_at)
select a,'authenticated','authenticated',a::text||'@example.invalid',jsonb_build_object('display_name','f4ggot'),now(),now() from wf;
do $$ begin
  if (select display_name from public.profiles where id = (select a from wf)) !~ '^Player[0-9]*$' then
    raise exception 'Bad name at signup was kept';
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select a from wf), 'role', 'authenticated')::text, true);

do $$ begin
  -- Court chat refuses banned words, allows normal talk (including regular cussing).
  begin
    insert into public.court_messages (court_id, user_id, body) select court_id, a, 'kys' from wf;
    raise exception 'Banned message was posted';
  exception when raise_exception then if sqlerrm not like 'That message%' then raise; end if; end;
  insert into public.court_messages (court_id, user_id, body) select court_id, a, 'spicy wings after, this run is fire' from wf;

  -- Name and bio changes are checked; normal ones save.
  begin
    update public.profiles set username = 'retard' where id = auth.uid();
    raise exception 'Banned name was saved';
  exception when raise_exception then if sqlerrm not like 'That name%' then raise; end if; end;
  begin
    update public.profiles set bio = 'p0rn' where id = auth.uid();
    raise exception 'Banned bio was saved';
  exception when raise_exception then if sqlerrm not like 'Your bio%' then raise; end if; end;
  update public.profiles set username = 'RayQaTest', bio = 'Hoops at Himmel' where id = auth.uid();
  if (select display_name from public.profiles where id = auth.uid()) <> 'RayQaTest' then
    raise exception 'Name did not follow the username';
  end if;

  -- Players can't read or change the word list.
  begin
    perform 1 from private.banned_words limit 1;
    raise exception 'Player can read the word list';
  exception when insufficient_privilege then null; end;
end $$;

rollback;
select 'PASS: chat filter, name + bio filter, signup name cleaned, normal talk allowed, word list hidden; nothing kept' as test_result;
