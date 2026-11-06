-- Usernames + friends. Fully rolled back: the 4 temporary players, their friendships
-- and blocks are never kept.
begin;
create temp table fp as
select gen_random_uuid() a, gen_random_uuid() b, gen_random_uuid() c, gen_random_uuid() d;
alter table fp enable row level security;
create policy fp_read on fp for select to authenticated, anon using (true);
grant select on fp to authenticated, anon;

insert into auth.users(id,aud,role,email,raw_user_meta_data,created_at,updated_at)
select v.id,'authenticated','authenticated',v.id::text||'@example.invalid',
  jsonb_build_object('display_name', v.n),now(),now()
from fp, lateral (values (a,'Zq Friend Test'),(b,'Zq Friend Test'),(c,'Zq Other'),(d,'x')) v(id,n);

-- Usernames got made at signup from the name (capitals kept), unique ignoring case;
-- short names fall back to "Player". The shown name always equals the username.
do $$ begin
  if (select username from public.profiles where id = (select a from fp)) <> 'ZqFriendTest' then
    raise exception 'First player did not get the plain username';
  end if;
  if (select username from public.profiles where id = (select b from fp)) !~ '^ZqFriendTest[0-9]{4}$' then
    raise exception 'Second player with the same name did not get a numbered username';
  end if;
  if (select username from public.profiles where id = (select d from fp)) !~ '^Player' then
    raise exception 'Too-short name did not fall back to player';
  end if;
  if exists (select 1 from public.profiles where id in (select a from fp union all select b from fp) and display_name <> username) then
    raise exception 'Shown name does not match username';
  end if;
end $$;

create function pg_temp.as_player(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
$$;

set local role authenticated;

-- Changing your username: format and word filter enforced, taken names refused.
select pg_temp.as_player(c) from fp;
update public.profiles set username = 'Zq_Other_Guy' where id = (select c from fp);
do $$ begin
  if (select display_name from public.profiles where id = (select c from fp)) <> 'Zq_Other_Guy' then
    raise exception 'Name did not follow the new username';
  end if;
  update public.profiles set display_name = 'Sneaky' where id = (select c from fp);
  if (select display_name from public.profiles where id = (select c from fp)) <> 'Zq_Other_Guy' then
    raise exception 'Name changed without the username';
  end if;
end $$;
do $$ begin
  begin
    update public.profiles set username = 'Bad Name!' where id = (select c from fp);
    raise exception 'Bad username format allowed';
  exception when check_violation then null; end;
  begin
    update public.profiles set username = 'zqfriendtest' where id = (select c from fp);
    raise exception 'Taken username allowed';
  exception when unique_violation then null; end;
  begin
    update public.profiles set username = 'big_porn' where id = (select c from fp);
    raise exception 'Banned word allowed in username';
  exception when raise_exception then
    if sqlerrm not like '%aren''t allowed%' then raise; end if;
  end;
end $$;

-- Search finds by username or name, never yourself.
select pg_temp.as_player(a) from fp;
do $$ begin
  if not exists (select 1 from public.search_players('zq_other') where id = (select c from fp)) then
    raise exception 'Search by username failed';
  end if;
  if not exists (select 1 from public.search_players('@ZQ_OTHER') where id = (select c from fp)) then
    raise exception 'Search with @ and capitals failed';
  end if;
  if not exists (select 1 from public.search_players('friendtest') where id = (select b from fp)) then
    raise exception 'Search inside a username failed';
  end if;
  if (select id from public.find_player('zqfriendtest')) is distinct from (select a from fp) then
    raise exception 'Friend link lookup ignoring case failed';
  end if;
  if exists (select 1 from public.search_players('zqfriend') where id = (select a from fp)) then
    raise exception 'Search returned yourself';
  end if;
  if exists (select 1 from public.search_players('z')) then
    raise exception 'One-letter search returned results';
  end if;
end $$;

-- Players can't write friendships directly.
do $$ begin
  begin
    insert into public.friendships (requester_id, addressee_id, status) select a, b, 'accepted' from fp;
    raise exception 'Direct insert allowed';
  exception when insufficient_privilege then null; end;
end $$;

-- A asks B. Asking twice is harmless. Can't add yourself.
do $$ begin
  if public.send_friend_request((select b from fp)) <> 'sent' then raise exception 'Request not sent'; end if;
  if public.send_friend_request((select b from fp)) <> 'sent' then raise exception 'Second ask changed something'; end if;
  begin
    perform public.send_friend_request((select a from fp));
    raise exception 'Added yourself';
  exception when raise_exception then
    if sqlerrm not like '%yourself%' then raise; end if;
  end;
  if (select state from public.my_friends() where id = (select b from fp)) <> 'outgoing' then
    raise exception 'Sender does not see outgoing request';
  end if;
end $$;

-- C can't see A and B's request, and can't accept it for B.
select pg_temp.as_player(c) from fp;
do $$ begin
  if exists (select 1 from public.friendships) then raise exception 'Outsider sees others'' requests'; end if;
  if exists (select 1 from public.my_friends()) then raise exception 'Outsider sees others'' friends'; end if;
  begin
    perform public.accept_friend_request((select a from fp));
    raise exception 'Outsider accepted a request';
  exception when raise_exception then
    if sqlerrm not like '%gone%' then raise; end if;
  end;
end $$;

-- B sees it as incoming and accepts. Now both are friends.
select pg_temp.as_player(b) from fp;
do $$ begin
  if (select state from public.my_friends() where id = (select a from fp)) <> 'incoming' then
    raise exception 'Receiver does not see incoming request';
  end if;
  perform public.accept_friend_request((select a from fp));
  if (select state from public.my_friends() where id = (select a from fp)) <> 'friends' then
    raise exception 'Not friends after accept';
  end if;
end $$;
select pg_temp.as_player(a) from fp;
do $$ begin
  if (select state from public.my_friends() where id = (select b from fp)) <> 'friends' then
    raise exception 'Sender does not see the friendship';
  end if;
end $$;

-- C asks A, then A asks C back: that accepts it instead of making a second row.
select pg_temp.as_player(c) from fp;
select public.send_friend_request(a) from fp;
select pg_temp.as_player(a) from fp;
do $$ begin
  if public.send_friend_request((select c from fp)) <> 'friends' then raise exception 'Asking back did not accept'; end if;
  if (select count(*) from public.friendships) <> 2 then raise exception 'Wrong number of friendships'; end if;
end $$;

-- A unfriends C.
select public.remove_friend(c) from fp;
do $$ begin
  if exists (select 1 from public.my_friends() where id = (select c from fp)) then raise exception 'Unfriend failed'; end if;
end $$;

-- A blocks B: friendship ends, B can't ask again, and they vanish from each other's search.
insert into public.player_blocks (blocked_id) select b from fp;
do $$ begin
  if exists (select 1 from public.my_friends() where id = (select b from fp)) then
    raise exception 'Block did not end the friendship';
  end if;
  if exists (select 1 from public.search_players('zqfriendtest') where id = (select b from fp)) then
    raise exception 'Blocked player shows in search';
  end if;
end $$;
select pg_temp.as_player(b) from fp;
do $$ begin
  if exists (select 1 from public.search_players('zqfriendtest') where id = (select a from fp)) then
    raise exception 'Blocker shows in blocked player''s search';
  end if;
  begin
    perform public.send_friend_request((select a from fp));
    raise exception 'Blocked player sent a request';
  exception when raise_exception then
    if sqlerrm not like '%can''t add%' then raise; end if;
  end;
end $$;

-- Signed out: nothing.
reset role;
set local role anon;
do $$ begin
  begin
    perform public.search_players('zq');
    raise exception 'Signed-out search allowed';
  exception when insufficient_privilege then null; end;
end $$;

select 'PASS: usernames, search, friend requests, unfriend, and block all behave' as result;
rollback;
