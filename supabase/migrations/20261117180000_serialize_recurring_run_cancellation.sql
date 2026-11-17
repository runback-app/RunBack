create or replace function private.materialize_runs() returns void language sql security definer set search_path='' as $$
 -- Hold a lock on each active series until its occurrences are inserted.
 -- If a stop already holds the series lock, leave it for the next scheduler pass.
 with active_series as materialized (
   select * from public.run_series where active for share skip locked
 )
 insert into public.runs(crew_id,series_id,occurrence_date,court_id,title,starts_at,duration_minutes)
 select s.crew_id,s.id,d::date,s.court_id,s.title, (d::date+s.local_time) at time zone s.timezone,s.duration_minutes
 from active_series s cross join lateral generate_series(greatest(s.starts_on,(now() at time zone s.timezone)::date), (now() at time zone s.timezone)::date+84, interval '1 day') d
 where extract(dow from d)::integer=any(s.weekdays) and ((d::date+s.local_time) at time zone s.timezone)>now()
 on conflict(series_id,occurrence_date) do nothing;
$$;

-- Cancel future occurrences that were inserted during an earlier stop.
update public.runs r
set cancelled = true
from public.run_series s
where r.series_id = s.id
  and not s.active
  and r.starts_at > now()
  and not r.cancelled;
