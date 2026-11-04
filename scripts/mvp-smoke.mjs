// Explicitly run against the shared backend to exercise the public API.
// Disposable accounts and their private crew are deleted unless --keep is used
// for a browser walkthrough. Never uses an admin key or prints credentials.
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import assert from 'node:assert/strict';

const fixturePath = process.env.RUNBACK_QA_FIXTURE;
if (!fixturePath) throw new Error('Set RUNBACK_QA_FIXTURE to an absolute scratch path.');
const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) throw new Error('Load the public app configuration first.');
const client = () => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const ok = (result, label) => { if (result.error) throw new Error(`${label}: ${result.error.message}`); return result.data; };
let fixture;
const clients = [];
const passed = [];
function pass(label) { passed.push(label); console.log(`PASS: ${label}`); }
async function save() { await writeFile(fixturePath, JSON.stringify(fixture), { mode: 0o600 }); }
async function cleanup() {
  if (!fixture) return;
  for (const account of fixture.accounts ?? []) {
    const db = client();
    const auth = await db.auth.signInWithPassword({ email: account.email, password: account.password });
    if (auth.error) { console.error('Cleanup requires help for a disposable QA account.'); continue; }
    if (fixture.photo && account.id === fixture.accounts[0].id) {
      ok(await db.storage.from('crew-photos').remove([fixture.photo]), 'Remove disposable crew photo');
    }
    ok(await db.rpc('delete_my_account'), 'Delete disposable QA account');
    await db.auth.signOut();
  }
  await unlink(fixturePath).catch(() => {});
  console.log('Disposable QA accounts and crew cleaned up.');
}

if (process.argv.includes('--cleanup')) {
  fixture = JSON.parse(await readFile(fixturePath, 'utf8'));
  await cleanup();
  process.exit(0);
}

fixture = { stamp: Date.now(), accounts: [] };
await save();
let completed = false;
try {
  const anon = client();
  const courts = ok(await anon.from('courts').select('*').order('sort_order'), 'Public courts');
  assert(courts.length >= 4);
  const privateProfiles = await anon.from('profiles').select('id,display_name').limit(1);
  assert(privateProfiles.error || !privateProfiles.data?.length);
  pass('Signed-out courts are available; player profiles are private');

  for (const label of ['Leader', 'Member']) {
    const account = { email: `qa-${fixture.stamp}-${label.toLowerCase()}@runback.net`, password: randomBytes(24).toString('base64url'), label };
    fixture.accounts.push(account); await save();
    const db = client(); clients.push(db);
    const auth = ok(await db.auth.signUp({ email: account.email, password: account.password, options: { data: { display_name: `MVP QA ${label}` } } }), 'Create disposable QA player');
    account.id = auth.user?.id; await save();
    assert(auth.session, 'Email confirmation is enabled; an inbox walkthrough is required instead of unattended fixture creation.');
    const profile = ok(await db.from('profiles').select('id,display_name').eq('id', account.id).single(), 'Profile created automatically');
    assert.equal(profile.display_name, `MVP QA ${label}`);
  }
  const [leader, member] = clients;
  const [a, b] = fixture.accounts;
  pass('Two new accounts receive separate profiles and signed-in sessions');
  const court = courts.find(c => c.slug === 'north-rec') ?? courts[0];
  ok(await leader.from('profiles').update({ position: 'SF', bio: 'Disposable MVP QA account.' }).eq('id', a.id), 'Edit own profile');
  const spoofProfile = await member.from('profiles').update({ bio: 'Unauthorized' }).eq('id', a.id);
  const unchanged = ok(await leader.from('profiles').select('bio').eq('id', a.id).single(), 'Read own profile');
  assert(spoofProfile.error || unchanged.bio !== 'Unauthorized');
  pass('Profile editing stays with the account owner');

  const crew = ok(await leader.rpc('create_crew', { p_name: `MVP QA ${fixture.stamp}`, p_court_id: court.id, p_schedule: 'Disposable test crew' }), 'Create private test crew');
  fixture.crewId = crew.id; fixture.inviteCode = crew.invite_code; await save();
  const preview = ok(await anon.rpc('crew_preview', { p_code: crew.invite_code }), 'Read invitation preview');
  assert.equal(preview[0].members, 1);
  assert.equal(ok(await member.rpc('join_crew', { p_code: crew.invite_code }), 'Join test crew'), crew.id);
  const members = ok(await member.from('crew_members').select('user_id,role').eq('crew_id', crew.id), 'Read crew membership');
  assert.equal(members.length, 2);
  pass('Leader creates a crew; another player joins using its invitation');

  const starts = new Date(Date.now() + 2 * 3600000).toISOString();
  const run = ok(await leader.from('runs').insert({ crew_id: crew.id, court_id: court.id, title: 'MVP QA one-time run', starts_at: starts, duration_minutes: 60 }).select().single(), 'Create one-time run');
  fixture.runId = run.id; await save();
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const series = ok(await leader.from('run_series').insert({ crew_id: crew.id, court_id: court.id, title: 'MVP QA recurring run', starts_on: tomorrow, local_time: '18:00', weekdays: [0,1,2,3,4,5,6], timezone: 'America/Phoenix', duration_minutes: 90 }).select().single(), 'Create recurring run');
  const recurring = ok(await leader.from('runs').select('id,starts_at').eq('series_id', series.id), 'Read recurring dates');
  assert(recurring.length >= 70);
  for (const status of ['going', 'maybe', 'going']) {
    ok(await member.rpc('set_run_rsvp', { p_run_id: run.id, p_status: status, p_reminder: false }), 'Save and change RSVP');
    const saved = ok(await member.from('run_rsvps').select('status,reminder').eq('run_id', run.id).eq('user_id', b.id).single(), 'Verify changed RSVP');
    assert.equal(saved.status, status); assert.equal(saved.reminder, false);
  }
  const attendance = ok(await leader.from('run_rsvps').select('*').eq('run_id', run.id), 'Read date attendance');
  assert.equal(attendance.length, 1); assert.equal(attendance[0].user_id, b.id);
  const otherAttendance = ok(await leader.from('run_rsvps').select('*').eq('run_id', recurring[0].id), 'Read separate date attendance');
  assert.equal(otherAttendance.length, 0);
  const spoof = await member.from('run_rsvps').insert({ run_id: run.id, user_id: a.id, status: 'going' });
  assert(spoof.error);
  assert((await anon.rpc('set_run_rsvp', { p_run_id: run.id, p_status: 'going' })).error);
  assert((await member.rpc('set_run_rsvp', { p_run_id: run.id, p_status: 'invalid' })).error);
  pass('One-time and recurring runs work; attendance belongs to a specific player and date');

  ok(await leader.from('crew_messages').insert({ crew_id: crew.id, user_id: a.id, body: 'Disposable crew chat test.' }), 'Send crew chat');
  ok(await member.from('crew_messages').insert({ crew_id: crew.id, run_id: run.id, user_id: b.id, body: 'Disposable run chat test.' }), 'Send run chat');
  assert.equal(ok(await member.from('crew_messages').select('id').eq('crew_id', crew.id).is('run_id', null), 'Read crew chat').length, 1);
  assert.equal(ok(await leader.from('crew_messages').select('id').eq('run_id', run.id), 'Read run chat').length, 1);
  const anonymousChat = await anon.from('crew_messages').select('id').eq('crew_id', crew.id);
  assert(anonymousChat.error || !anonymousChat.data?.length);
  pass('Crew and run chat stay separate and are hidden from signed-out visitors');

  const photo = `${crew.id}/qa-${fixture.stamp}.jpg`;
  const jpeg = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDzaiiigD//2Q==', 'base64');
  ok(await leader.storage.from('crew-photos').upload(photo, jpeg, { contentType: 'image/jpeg' }), 'Upload private crew photo');
  fixture.photo = photo; await save();
  assert(ok(await member.storage.from('crew-photos').createSignedUrl(photo, 60), 'Member reads crew photo').signedUrl);
  assert((await anon.storage.from('crew-photos').createSignedUrl(photo, 60)).error);
  assert((await member.storage.from('crew-photos').upload(`${crew.id}/forbidden.jpg`, jpeg, { contentType: 'image/jpeg' })).error);
  pass('Crew photos are readable by members and uploadable only by the leader');

  ok(await leader.from('crew_members').delete().eq('crew_id', crew.id).eq('user_id', b.id), 'Remove member');
  assert.equal(ok(await member.from('runs').select('id').eq('id', run.id), 'Removed member cannot read run').length, 0);
  assert.equal(ok(await member.from('crew_messages').select('id').eq('crew_id', crew.id), 'Removed member cannot read chat').length, 0);
  assert((await member.rpc('set_run_rsvp', { p_run_id: run.id, p_status: 'going' })).error);
  ok(await member.rpc('join_crew', { p_code: crew.invite_code }), 'Rejoin test crew');
  const newCode = randomBytes(10).toString('hex');
  ok(await leader.from('crews').update({ invite_code: newCode }).eq('id', crew.id), 'Replace invite');
  assert.equal(ok(await anon.rpc('crew_preview', { p_code: crew.invite_code }), 'Old invite is invalid').length, 0);
  fixture.inviteCode = newCode; await save();
  pass('Removing a member revokes crew access; replacing an invitation invalidates its old link');
  ok(await member.rpc('set_run_rsvp', { p_run_id: recurring[0].id, p_status: 'going' }), 'RSVP before cancellation');
  ok(await leader.from('runs').update({ cancelled: true }).eq('id', recurring[0].id), 'Cancel disposable run');
  assert((await member.rpc('set_run_rsvp', { p_run_id: recurring[0].id, p_status: 'maybe' })).error);
  pass('Cancelled dates reject new or changed attendance');
  completed = true;
  console.log(`${passed.length} public API scenarios passed.`);
} finally {
  if (!completed || !process.argv.includes('--keep')) await cleanup();
  else console.log('Disposable fixtures retained for the browser walkthrough; run --cleanup afterward.');
}
