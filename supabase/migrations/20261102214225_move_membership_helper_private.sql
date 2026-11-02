-- Keep the membership helper out of the public API.
create schema if not exists private;
grant usage on schema private to authenticated;

create function private.is_crew_member(p_crew_id uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.crew_members
    where crew_id = p_crew_id and user_id = auth.uid()
  );
$$;
revoke execute on function private.is_crew_member(uuid) from public, anon;
grant execute on function private.is_crew_member(uuid) to authenticated;

drop policy "Members can see their crews" on public.crews;
drop policy "Members can see crewmates" on public.crew_members;
create policy "Members can see their crews" on public.crews
  for select to authenticated using (private.is_crew_member(id));
create policy "Members can see crewmates" on public.crew_members
  for select to authenticated using (private.is_crew_member(crew_id));

drop function public.is_crew_member(uuid);
