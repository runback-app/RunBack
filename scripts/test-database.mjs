// Embedded PostgreSQL runs the real migrations and RLS. Supabase platform services
// (auth API, Storage API, HTTP delivery and cron execution) are not emulated.
import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
import { readFile, readdir } from 'node:fs/promises';
const connectionString = process.env.RUNBACK_TEST_DB_URL;
if (connectionString && !['localhost', '127.0.0.1', '[::1]'].includes(new URL(connectionString).hostname)) {
  throw new Error('Database tests only run against an explicitly disposable loopback database.');
}
const client = connectionString ? new pg.Client({ connectionString }) : null;
if (client) await client.connect();
const db = client ? { exec: sql => client.query(sql), close: () => client.end() } : new PGlite();
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema storage; create schema extensions;
    create schema vault; create schema net; create schema cron;
    create table auth.users(id uuid primary key, email text, aud text, role text,
      raw_user_meta_data jsonb default '{}', created_at timestamptz default now(), updated_at timestamptz default now());
    create function auth.uid() returns uuid language sql stable as $$
      select (nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub')::uuid;
    $$;
    create function extensions.gen_random_bytes(n int) returns bytea language sql volatile as $$
      select substring(decode(replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''), 'hex') from 1 for n);
    $$;
    create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
    alter table storage.objects enable row level security;
    create function storage.foldername(name text) returns text[] language sql immutable as $$
      select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1)-1];
    $$;
    create table vault.decrypted_secrets(name text, decrypted_secret text);
    create table net.http_request_queue(id bigserial, url text, body bytea);
    create function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000)
      returns bigint language sql as $$ insert into net.http_request_queue(url,body) values(url,convert_to(body::text,'UTF8')) returning id; $$;
    create table cron.job(jobname text, schedule text, command text);
    create function cron.schedule(job_name text, schedule text, command text) returns bigint language sql as $$
      insert into cron.job values(job_name,schedule,command) returning 1::bigint;
    $$;
    grant usage on schema public,auth,storage,extensions to anon,authenticated,service_role;
    grant usage on schema net,vault,cron to service_role;
    grant select,insert,update,delete on storage.objects to authenticated;
    alter default privileges in schema public grant all on tables to service_role;
  `);
  const migrations = (await readdir('supabase/migrations')).filter(p => p.endsWith('.sql')).sort();
  for (const file of migrations) {
    const sql = (await readFile(`supabase/migrations/${file}`, 'utf8'))
      .replace(/create extension if not exists pg_(?:cron|net)[^;]*;/gi, '');
    try { await db.exec(sql); } catch (e) { throw new Error(`${file}: ${e.message}`); }
  }
  await db.exec(`
    insert into auth.users(id,email,raw_user_meta_data) values
      ('11111111-1111-4111-8111-111111111111','owner@example.invalid','{"display_name":"qa_owner"}'),
      ('22222222-2222-4222-8222-222222222222','member@example.invalid','{"display_name":"qa_member"}');
    select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',false);
    select public.create_crew('QA crew',(select id from public.courts limit 1),'');
    insert into public.crew_members(crew_id,user_id,role) select id,'22222222-2222-4222-8222-222222222222','member' from public.crews;
  `);
  for (const file of ['runs_chat_permissions.sql', 'feedback_email_permissions.sql', 'reliability_permissions.sql']) {
    try { await db.exec(await readFile(`supabase/tests/${file}`, 'utf8')); }
    catch (e) { throw new Error(`${file}: ${e.message}`); }
    console.log(`PASS ${file}`);
  }
  if (client) {
    const { verifyConcurrentCancellation } = await import('./test-concurrent-cancellation.mjs');
    await verifyConcurrentCancellation(client, connectionString);
  }
  console.log(`Applied ${migrations.length} migrations. HTTP and cron are stubs; real delivery needs device tests.${client ? '' : ' Use RUNBACK_TEST_DB_URL with disposable local PostgreSQL for concurrent-session checks.'}`);
} finally { await db.close(); }
