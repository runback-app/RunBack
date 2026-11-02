begin;
alter table public.crews add column description text not null default '' check (char_length(description)<=500), add column avatar_url text;
alter table public.courts add column access_note text, add column hoop_count integer check (hoop_count>0), add column closure_note text, add column closure_until timestamptz;

create table public.run_series (
 id uuid primary key default gen_random_uuid(), crew_id uuid not null references public.crews on delete cascade,
 court_id uuid not null references public.courts, title text not null check(char_length(trim(title)) between 2 and 80),
 weekdays integer[] not null check(cardinality(weekdays) between 1 and 7 and weekdays <@ array[0,1,2,3,4,5,6]),
 local_time time not null, timezone text not null default 'America/Phoenix' check(timezone='America/Phoenix'),
 duration_minutes integer not null default 120 check(duration_minutes between 30 and 240),
 starts_on date not null, active boolean not null default true, created_at timestamptz not null default now()
);
create index run_series_crew_idx on public.run_series(crew_id);
create table public.runs (
 id uuid primary key default gen_random_uuid(), crew_id uuid not null references public.crews on delete cascade,
 series_id uuid references public.run_series on delete set null, occurrence_date date, court_id uuid not null references public.courts,
 title text not null check(char_length(trim(title)) between 2 and 80), starts_at timestamptz not null,
 duration_minutes integer not null default 120 check(duration_minutes between 30 and 240),
 cancelled boolean not null default false, created_at timestamptz not null default now(),
 unique(series_id, occurrence_date), unique(id, crew_id)
);
create index runs_crew_start_idx on public.runs(crew_id,starts_at);
create index runs_start_idx on public.runs(starts_at);
create table public.run_rsvps (
 run_id uuid not null references public.runs on delete cascade, user_id uuid not null references public.profiles on delete cascade,
 status text not null check(status in ('going','maybe','out')), reminder boolean not null default true,
 updated_at timestamptz not null default now(), primary key(run_id,user_id)
);
create index run_rsvps_user_idx on public.run_rsvps(user_id);
create table public.crew_messages (
 id uuid primary key default gen_random_uuid(), crew_id uuid not null references public.crews on delete cascade,
 run_id uuid, user_id uuid not null references public.profiles on delete cascade,
 body text not null check(char_length(trim(body)) between 1 and 1000), created_at timestamptz not null default now(),
 foreign key(run_id,crew_id) references public.runs(id,crew_id) on delete cascade
);
create index messages_thread_idx on public.crew_messages(crew_id,run_id,created_at desc);
create index messages_user_idx on public.crew_messages(user_id,created_at desc);
create table public.run_notifications (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles on delete cascade,
 run_id uuid not null references public.runs on delete cascade,
 kind text not null check(kind in ('reminder','changed','cancelled')), title text not null, body text not null,
 created_at timestamptz not null default now(), read_at timestamptz, processed_at timestamptz, unique(user_id,run_id,kind,created_at)
);
create unique index notification_reminder_once on public.run_notifications(user_id,run_id) where kind='reminder';
create index notifications_user_idx on public.run_notifications(user_id,created_at desc);

alter table public.run_series enable row level security;
alter table public.runs enable row level security;
alter table public.run_rsvps enable row level security;
alter table public.crew_messages enable row level security;
alter table public.run_notifications enable row level security;
create policy series_read on public.run_series for select to authenticated using(private.is_crew_member(crew_id));
create policy series_write on public.run_series for all to authenticated using(exists(select 1 from public.crews c where c.id=crew_id and c.created_by=(select auth.uid()))) with check(exists(select 1 from public.crews c where c.id=crew_id and c.created_by=(select auth.uid())));
create policy runs_read on public.runs for select to authenticated using(private.is_crew_member(crew_id));
create policy runs_write on public.runs for all to authenticated using(exists(select 1 from public.crews c where c.id=crew_id and c.created_by=(select auth.uid()))) with check(exists(select 1 from public.crews c where c.id=crew_id and c.created_by=(select auth.uid())));
create policy rsvp_read on public.run_rsvps for select to authenticated using(exists(select 1 from public.runs r where r.id=run_id and private.is_crew_member(r.crew_id)));
create policy rsvp_insert on public.run_rsvps for insert to authenticated with check(user_id=(select auth.uid()) and exists(select 1 from public.runs r where r.id=run_id and not r.cancelled and r.starts_at>now() and private.is_crew_member(r.crew_id)));
create policy rsvp_update on public.run_rsvps for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()) and exists(select 1 from public.runs r where r.id=run_id and not r.cancelled and r.starts_at>now() and private.is_crew_member(r.crew_id)));
create policy messages_read on public.crew_messages for select to authenticated using(private.is_crew_member(crew_id));
create policy messages_insert on public.crew_messages for insert to authenticated with check(user_id=(select auth.uid()) and private.is_crew_member(crew_id));
create policy messages_delete on public.crew_messages for delete to authenticated using(private.is_crew_member(crew_id) and (user_id=(select auth.uid()) or exists(select 1 from public.crews c where c.id=crew_id and c.created_by=(select auth.uid()))));
create policy notifications_read on public.run_notifications for select to authenticated using(user_id=(select auth.uid()) and exists(select 1 from public.runs r where r.id=run_id and private.is_crew_member(r.crew_id)));
create policy notifications_update on public.run_notifications for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
revoke all on public.run_series,public.runs,public.run_rsvps,public.crew_messages,public.run_notifications from authenticated;
grant select,insert on public.run_series,public.runs to authenticated;
grant update(active) on public.run_series to authenticated;
grant update(title,court_id,starts_at,duration_minutes,cancelled) on public.runs to authenticated;
grant select,insert on public.run_rsvps to authenticated;
grant update(status,reminder,updated_at) on public.run_rsvps to authenticated;
grant select,insert,delete on public.crew_messages to authenticated;
grant select on public.run_notifications to authenticated;
grant update(read_at) on public.run_notifications to authenticated;
revoke all on public.run_series,public.runs,public.run_rsvps,public.crew_messages,public.run_notifications from anon;

-- Prevent an existing owner from assigning an existing crew to themselves or changing its ID.
revoke update on public.crews from authenticated;
grant update(name,court_id,schedule,description,avatar_url,invite_code) on public.crews to authenticated;
-- Leaders may remove members, but cannot remove the leader through this endpoint.
create policy leader_remove_member on public.crew_members for delete to authenticated using(role='member' and exists(select 1 from public.crews c where c.id=crew_id and c.created_by=(select auth.uid())));
-- Leaving/removal also removes future RSVPs so counts and reminders stay accurate.
create function private.clean_member_rsvps() returns trigger language plpgsql security definer set search_path='' as $$
begin delete from public.run_rsvps v using public.runs r where v.run_id=r.id and r.crew_id=old.crew_id and v.user_id=old.user_id and r.starts_at>now(); return old; end $$;
revoke all on function private.clean_member_rsvps() from public,anon,authenticated;
create trigger clean_member_rsvps after delete on public.crew_members for each row execute function private.clean_member_rsvps();

-- Replenish a rolling 12-week schedule in Tucson local time. Private, trigger/cron only.
create function private.materialize_runs() returns void language sql security definer set search_path='' as $$
 insert into public.runs(crew_id,series_id,occurrence_date,court_id,title,starts_at,duration_minutes)
 select s.crew_id,s.id,d::date,s.court_id,s.title, (d::date+s.local_time) at time zone s.timezone,s.duration_minutes
 from public.run_series s cross join lateral generate_series(greatest(s.starts_on,(now() at time zone s.timezone)::date), (now() at time zone s.timezone)::date+84, interval '1 day') d
 where s.active and extract(dow from d)::integer=any(s.weekdays) and ((d::date+s.local_time) at time zone s.timezone)>now()
 on conflict(series_id,occurrence_date) do nothing;
$$;
revoke all on function private.materialize_runs() from public,anon,authenticated;
create function private.series_changed() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and not new.active then update public.runs set cancelled=true where series_id=new.id and starts_at>now() and not cancelled; end if;
 perform private.materialize_runs(); return new;
end $$;
revoke all on function private.series_changed() from public,anon,authenticated;
create trigger series_changed after insert or update on public.run_series for each row execute function private.series_changed();

create function private.limit_chat() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.user_id::text,0));
 if exists(select 1 from public.crew_messages where user_id=new.user_id and created_at>now()-interval '2 seconds') then raise exception 'Wait a moment before sending another message'; end if;
 if (select count(*) from public.crew_messages where user_id=new.user_id and created_at>now()-interval '1 hour')>=100 then raise exception 'Message limit reached. Try later'; end if;
 new.body=trim(new.body); new.created_at=now(); return new;
end $$;
revoke all on function private.limit_chat() from public,anon,authenticated;
create trigger limit_chat before insert on public.crew_messages for each row execute function private.limit_chat();

create function private.notify_run_change() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.starts_at>now() and (new.starts_at is distinct from old.starts_at or new.court_id is distinct from old.court_id or new.cancelled is distinct from old.cancelled or new.title is distinct from old.title) then
 insert into public.run_notifications(user_id,run_id,kind,title,body)
 select v.user_id,new.id,case when new.cancelled then 'cancelled' else 'changed' end,
 case when new.cancelled then 'Run cancelled' else 'Run updated' end,new.title||' — check the latest details.'
 from public.run_rsvps v join public.crew_members m on m.user_id=v.user_id and m.crew_id=new.crew_id where v.run_id=new.id and v.status<>'out';
 end if; return new;
end $$;
revoke all on function private.notify_run_change() from public,anon,authenticated;
create trigger notify_run_change after update on public.runs for each row execute function private.notify_run_change();
create function private.queue_run_reminders() returns void language sql security definer set search_path='' as $$
 insert into public.run_notifications(user_id,run_id,kind,title,body)
 select v.user_id,r.id,'reminder','Your run starts soon',r.title||' starts at '||to_char(r.starts_at at time zone 'America/Phoenix','FMHH12:MI AM')||' at '||c.name||'.'
 from public.run_rsvps v join public.runs r on r.id=v.run_id join public.courts c on c.id=r.court_id join public.crew_members m on m.crew_id=r.crew_id and m.user_id=v.user_id
 where v.reminder and v.status='going' and not r.cancelled and r.starts_at>now() and r.starts_at<=now()+interval '30 minutes'
 on conflict(user_id,run_id) where kind='reminder' do nothing;
$$;
revoke all on function private.queue_run_reminders() from public,anon,authenticated;
select cron.schedule('runback-materialize-runs','10 8 * * *','select private.materialize_runs()');
select cron.schedule('runback-run-reminders','* * * * *','select private.queue_run_reminders()');

-- Private photos: members may view; only the actual crew leader may upload or replace.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('crew-photos','crew-photos',false,1048576,array['image/jpeg']);
create policy crew_photo_read on storage.objects for select to authenticated using(bucket_id='crew-photos' and exists(select 1 from public.crews c where c.id::text=(storage.foldername(name))[1] and private.is_crew_member(c.id)));
create policy crew_photo_insert on storage.objects for insert to authenticated with check(bucket_id='crew-photos' and exists(select 1 from public.crews c where c.id::text=(storage.foldername(name))[1] and c.created_by=(select auth.uid())));
create policy crew_photo_update on storage.objects for update to authenticated using(bucket_id='crew-photos' and exists(select 1 from public.crews c where c.id::text=(storage.foldername(name))[1] and c.created_by=(select auth.uid()))) with check(bucket_id='crew-photos' and exists(select 1 from public.crews c where c.id::text=(storage.foldername(name))[1] and c.created_by=(select auth.uid())));
create policy crew_photo_delete on storage.objects for delete to authenticated using(bucket_id='crew-photos' and exists(select 1 from public.crews c where c.id::text=(storage.foldername(name))[1] and c.created_by=(select auth.uid())));
-- The existing push sender can also deliver queued run updates. Service role only.
grant all on public.run_series,public.runs,public.run_rsvps,public.crew_messages,public.run_notifications to service_role;
create function public.run_alert_targets(p_notification_id uuid)
returns table(endpoint text,p256dh text,auth text,title text,body text,url text)
language plpgsql security invoker set search_path='' as $$
declare n public.run_notifications;
begin
 update public.run_notifications set processed_at=now() where id=p_notification_id and processed_at is null and created_at>now()-interval '5 minutes' returning * into n;
 if n.id is null then return; end if;
 return query select s.endpoint,s.p256dh,s.auth,n.title,n.body,'/run/'||n.run_id::text from public.push_subscriptions s
 join public.runs r on r.id=n.run_id join public.crew_members m on m.crew_id=r.crew_id and m.user_id=n.user_id
 where s.user_id=n.user_id;
end $$;
revoke all on function public.run_alert_targets(uuid) from public,anon,authenticated;
grant execute on function public.run_alert_targets(uuid) to service_role;
create function private.queue_run_push() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform net.http_post(url:='https://ioxmdthiblgudygedjmc.supabase.co/functions/v1/send-alerts',body:=jsonb_build_object('notification_id',new.id),headers:=jsonb_build_object('Content-Type','application/json'),timeout_milliseconds:=5000);
 return new;
end $$;
revoke all on function private.queue_run_push() from public,anon,authenticated;
create trigger run_notification_push after insert on public.run_notifications for each row execute function private.queue_run_push();
commit;
