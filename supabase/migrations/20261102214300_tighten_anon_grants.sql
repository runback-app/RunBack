-- Signed-out visitors can only read courts and call the public functions.
revoke all on public.profiles, public.checkins, public.crews, public.crew_members from anon;
revoke insert, update, delete, truncate, references, trigger on public.courts from anon, authenticated;
revoke insert, delete, truncate, references, trigger on public.profiles from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.checkins from authenticated;
revoke insert, truncate, references, trigger on public.crews from authenticated;
revoke insert, update, truncate, references, trigger on public.crew_members from authenticated;
