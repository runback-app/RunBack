-- ============ BLOCK A PLAYER ============
-- Any signed-in player can block another player. Blocking works both ways:
--   * neither player sees the other's court chat messages
--   * a captain can't pull a player onto their team if either one blocked the other
-- Only the blocker can see their own block list. The blocked player is never told.

create table public.player_blocks (
  blocker_id uuid not null default auth.uid() references public.profiles on delete cascade,
  blocked_id uuid not null references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint player_blocks_not_self check (blocker_id <> blocked_id)
);
create index player_blocks_blocked_idx on public.player_blocks(blocked_id);

alter table public.player_blocks enable row level security;

create policy player_blocks_read_own on public.player_blocks for select to authenticated
  using (blocker_id = (select auth.uid()));
create policy player_blocks_insert_own on public.player_blocks for insert to authenticated
  with check (blocker_id = (select auth.uid()));
create policy player_blocks_delete_own on public.player_blocks for delete to authenticated
  using (blocker_id = (select auth.uid()));

revoke all on public.player_blocks from anon, authenticated;
grant select, delete on public.player_blocks to authenticated;
grant insert (blocker_id, blocked_id) on public.player_blocks to authenticated;
grant all on public.player_blocks to service_role;

-- Max 200 blocks per player, and no block-spam (stops someone hammering the table).
create function private.limit_player_blocks() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.player_blocks where blocker_id = new.blocker_id) >= 200 then
    raise exception 'Block limit reached';
  end if;
  new.created_at := now();
  return new;
end $$;
revoke all on function private.limit_player_blocks() from public, anon, authenticated;
create trigger limit_player_blocks before insert on public.player_blocks
  for each row execute function private.limit_player_blocks();

-- True if either player blocked the other. Security definer so it can see blocks
-- made BY the other player (which the normal read policy hides).
create function private.blocked_between(p_a uuid, p_b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.player_blocks
    where (blocker_id = p_a and blocked_id = p_b)
       or (blocker_id = p_b and blocked_id = p_a)
  );
$$;
revoke all on function private.blocked_between(uuid, uuid) from public, anon;
grant execute on function private.blocked_between(uuid, uuid) to authenticated;

-- Court chat: also hide messages between blocked players.
drop policy court_messages_read on public.court_messages;
create policy court_messages_read on public.court_messages for select to authenticated
  using (
    created_at > now() - interval '24 hours'
    and not hidden
    and not exists (
      select 1 from public.court_message_reports r
      where r.message_id = court_messages.id and r.reporter_id = (select auth.uid())
    )
    and (user_id = (select auth.uid()) or not private.blocked_between((select auth.uid()), user_id))
  );

-- Got next: a captain can't add a free agent if either one blocked the other.
-- Same as the original add_free_agent, plus the block check.
create or replace function public.add_free_agent(p_user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  my_team uuid;
  team_court uuid;
  captain_name text;
  court_name text;
begin
  if uid is null then raise exception 'Not signed in'; end if;
  my_team := private.current_team(uid);
  if my_team is null then raise exception 'Start a team first'; end if;
  if private.team_captain(my_team) is distinct from uid then raise exception 'Only the captain can add players'; end if;
  if private.blocked_between(uid, p_user_id) then raise exception 'You can''t add that player'; end if;
  select court_id into team_court from public.court_teams where id = my_team;
  perform private.lock_court_line(team_court);
  if not private.is_live_at(p_user_id, team_court) then raise exception 'That player isn''t checked in here'; end if;
  if private.current_team(p_user_id) is not null then raise exception 'That player is already on a team'; end if;
  perform private.add_to_team(p_user_id, my_team);
  select display_name into captain_name from public.profiles where id = uid;
  select name into court_name from public.courts where id = team_court;
  insert into public.team_notifications (user_id, court_id, title, body)
    values (p_user_id, team_court, 'You got picked up', captain_name || ' added you to their team at ' || court_name || '.');
  perform private.alert_up_next(team_court);
end;
$$;
revoke all on function public.add_free_agent(uuid) from public, anon;
grant execute on function public.add_free_agent(uuid) to authenticated;
