import { supabase } from './supabase';
import type {
  Checkin,
  Court,
  CrewDetail,
  CrewPreview,
  CrewSummary,
  Favorite,
  LiveCheckin,
  Profile,
} from './types';
import type { LineRow } from './line';

const BRIEF = 'display_name, avatar_url, position, skill, height_in';

// Turns Supabase/Postgres errors into short messages people can act on.
function fail(error: { message?: string } | null, fallback: string): never {
  const raw = error?.message ?? '';
  if (/failed to fetch|network/i.test(raw)) throw new Error("Can't reach Runback. Check your connection and try again.");
  if (/jwt|not signed in|sign in/i.test(raw)) throw new Error(raw.includes('Sign in') ? raw : 'Sign in to do that.');
  throw new Error(raw || fallback);
}

// ---------- Courts and check-ins ----------

export async function fetchCourts(): Promise<Court[]> {
  const { data, error } = await supabase.from('courts').select('*').order('sort_order');
  if (error) fail(error, "Couldn't load courts.");
  return data as Court[];
}

/** Player counts per court. Works when signed out. */
export async function fetchActivity(): Promise<Record<string, number>> {
  const { data, error } = await supabase.rpc('court_activity');
  if (error) fail(error, "Couldn't load who's playing.");
  const counts: Record<string, number> = {};
  for (const row of (data ?? []) as { court_id: string; players: number }[]) counts[row.court_id] = row.players;
  return counts;
}

/** Live check-ins with player info. Only works when signed in. */
export async function fetchLiveCheckins(filter?: { courtId?: string; userId?: string }): Promise<LiveCheckin[]> {
  let query = supabase
    .from('checkins')
    .select(`id, court_id, user_id, created_at, expires_at, ended_at, profiles(${BRIEF})`)
    .is('ended_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false });
  if (filter?.courtId) query = query.eq('court_id', filter.courtId);
  if (filter?.userId) query = query.eq('user_id', filter.userId);
  const { data, error } = await query;
  if (error) fail(error, "Couldn't load who's here.");
  return data as unknown as LiveCheckin[];
}

export async function fetchMyCheckin(userId: string): Promise<Checkin | null> {
  const { data, error } = await supabase
    .from('checkins')
    .select('id, court_id, user_id, created_at, expires_at, ended_at')
    .eq('user_id', userId)
    .is('ended_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) fail(error, "Couldn't load your check-in.");
  return data as Checkin | null;
}

export async function checkIn(courtId: string, minutes: number): Promise<Checkin> {
  const { data, error } = await supabase.rpc('check_in', { p_court_id: courtId, p_minutes: minutes });
  if (error) fail(error, "Couldn't check you in.");
  return data as Checkin;
}

export async function checkOut(): Promise<void> {
  const { error } = await supabase.rpc('check_out');
  if (error) fail(error, "Couldn't check you out.");
}

// ---------- Got next (teams) ----------

// True when the teams feature isn't in the database yet, so the page can hide it instead of erroring.
function missingFeature(error: { message?: string; code?: string } | null): boolean {
  return !!error && (error.code === 'PGRST202' || /could not find the function|does not exist/i.test(error.message ?? ''));
}

/** Teams waiting and free agents per court. Works when signed out. */
export async function fetchLineCounts(): Promise<Record<string, { teams: number; freeAgents: number }>> {
  const { data, error } = await supabase.rpc('court_line_counts');
  if (missingFeature(error)) return {};
  if (error) fail(error, "Couldn't load the lines.");
  const counts: Record<string, { teams: number; freeAgents: number }> = {};
  for (const row of (data ?? []) as { court_id: string; teams: number; free_agents: number }[]) {
    counts[row.court_id] = { teams: row.teams, freeAgents: row.free_agents };
  }
  return counts;
}

/** The line at one court with names. Signed-in only. Null means the feature isn't set up yet. */
export async function fetchCourtLine(courtId: string): Promise<LineRow[] | null> {
  const { data, error } = await supabase.rpc('court_line', { p_court_id: courtId });
  if (missingFeature(error)) return null;
  if (error) fail(error, "Couldn't load the teams.");
  return (data ?? []) as LineRow[];
}

async function lineAction(fn: string, args: Record<string, string>, fallback: string): Promise<void> {
  const { error } = await supabase.rpc(fn, args);
  if (error) fail(error, fallback);
}

export const startTeam = (courtId: string) => lineAction('start_team', { p_court_id: courtId }, "Couldn't start a team.");
export const putMeOnTeam = (courtId: string) => lineAction('put_me_on_team', { p_court_id: courtId }, "Couldn't find you a team.");
export const joinTeam = (teamId: string) => lineAction('join_team', { p_team_id: teamId }, "Couldn't join that team.");
export const leaveTeam = () => lineAction('leave_team', {}, "Couldn't leave the team.");
export const teamOn = (teamId: string) => lineAction('team_on', { p_team_id: teamId }, "Couldn't update the line.");
export const addFreeAgent = (userId: string) => lineAction('add_free_agent', { p_user_id: userId }, "Couldn't add that player.");

// ---------- Favorites ----------

export async function fetchFavorites(): Promise<Favorite[]> {
  const { data, error } = await supabase.from('court_favorites').select('court_id, alerts, alert_at');
  if (error) fail(error, "Couldn't load your courts.");
  return data as Favorite[];
}

export async function addFavorite(userId: string, courtId: string): Promise<void> {
  const { error } = await supabase
    .from('court_favorites')
    .upsert({ user_id: userId, court_id: courtId }, { onConflict: 'user_id,court_id', ignoreDuplicates: true });
  if (error) fail(error, "Couldn't save that court.");
}

export async function removeFavorite(userId: string, courtId: string): Promise<void> {
  const { error } = await supabase.from('court_favorites').delete().eq('user_id', userId).eq('court_id', courtId);
  if (error) fail(error, "Couldn't remove that court.");
}

export async function updateFavorite(
  userId: string,
  courtId: string,
  changes: Partial<Pick<Favorite, 'alerts' | 'alert_at'>>,
): Promise<void> {
  const { error } = await supabase.from('court_favorites').update(changes).eq('user_id', userId).eq('court_id', courtId);
  if (error) fail(error, "Couldn't save that alert.");
}

// ---------- Profiles ----------

export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, username, position, skill, height_in, home_court_id, bio, avatar_url, notify_crew, created_at')
    .eq('id', userId)
    .maybeSingle();
  if (error) {
    if (/invalid input syntax for type uuid/i.test(error.message)) return null;
    fail(error, "Couldn't load that player.");
  }
  return data as Profile | null;
}

export type ProfileChanges = Partial<
  Pick<Profile, 'display_name' | 'username' | 'position' | 'skill' | 'height_in' | 'home_court_id' | 'bio' | 'avatar_url' | 'notify_crew'>
>;

export async function updateProfile(userId: string, changes: ProfileChanges): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ ...changes, updated_at: new Date().toISOString() })
    .eq('id', userId);
  if (error) {
    if (/bio_check/i.test(error.message)) throw new Error('Keep your bio under 160 characters.');
    if (/display_name_check/i.test(error.message)) throw new Error('Your name needs 1 to 40 characters.');
    if (/profiles_username_lower_key|duplicate key/i.test(error.message)) throw new Error('That name is taken. Try another one.');
    if (/profiles_username_format/i.test(error.message)) throw new Error('Names are 3 to 20 letters, numbers, or _ (no spaces).');
    fail(error, "Couldn't save your profile.");
  }
}

/** Uploads a new photo and returns its public link. Old photos are cleaned up. */
export async function uploadAvatar(userId: string, photo: Blob): Promise<string> {
  const path = `${userId}/${Date.now()}.jpg`;
  const bucket = supabase.storage.from('avatars');
  const { error } = await bucket.upload(path, photo, { contentType: 'image/jpeg', upsert: false, cacheControl: '31536000' });
  if (error) fail(error, "Couldn't upload that photo.");

  const { data: existing } = await bucket.list(userId);
  const old = (existing ?? []).map((f) => `${userId}/${f.name}`).filter((p) => p !== path);
  if (old.length) await bucket.remove(old);

  return bucket.getPublicUrl(path).data.publicUrl;
}

/**
 * Deletes the signed-in player's account and everything tied to it.
 * Photos live in file storage, so they're removed first; the database handles the rest.
 */
export async function deleteMyAccount(userId: string): Promise<void> {
  const { data: crews, error: crewError } = await supabase.from('crews').select('id').eq('created_by', userId);
  if (crewError) fail(crewError, "Couldn't check your crew photos. Try again.");
  for (const crew of crews ?? []) await removeCrewPhotos(crew.id);
  const bucket = supabase.storage.from('avatars');
  const { data: files, error: listError } = await bucket.list(userId);
  if (listError) fail(listError, "Couldn't check your profile photo. Try again.");
  const paths = (files ?? []).map((f) => `${userId}/${f.name}`);
  if (paths.length) {
    const { error: removeError } = await bucket.remove(paths);
    if (removeError) fail(removeError, "Couldn't remove your photo. Try again.");
  }
  const { error } = await supabase.rpc('delete_my_account');
  if (error) fail(error, "Couldn't delete your account. Try again.");
}

export async function sendFeedback(userId: string, message: string, page: string): Promise<void> {
  const { error } = await supabase.from('feedback').insert({ user_id: userId, message: message.trim(), page });
  if (error) {
    if (/feedback_message_check/i.test(error.message)) throw new Error('Messages need 1 to 2,000 characters.');
    fail(error, "Couldn't send that. Try again.");
  }
}

// ---------- Alerts ----------

export async function savePushSubscription(sub: PushSubscription): Promise<void> {
  const json = sub.toJSON();
  const { error } = await supabase.rpc('save_push_subscription', {
    p_endpoint: json.endpoint,
    p_p256dh: json.keys?.p256dh,
    p_auth: json.keys?.auth,
  });
  if (error) fail(error, "Couldn't turn on alerts.");
}

export async function deletePushSubscription(endpoint: string): Promise<void> {
  const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
  if (error) fail(error, "Couldn't turn off alerts.");
}

// ---------- Crews ----------

export async function fetchMyCrews(): Promise<CrewSummary[]> {
  const { data, error } = await supabase
    .from('crews')
    .select('*, courts(name, slug), crew_members(count)')
    .order('created_at', { ascending: false });
  if (error) fail(error, "Couldn't load your crews.");
  return data as unknown as CrewSummary[];
}

export async function fetchCrew(id: string): Promise<CrewDetail | null> {
  const { data, error } = await supabase
    .from('crews')
    .select(`*, courts(name, slug), crew_members(user_id, role, joined_at, profiles(${BRIEF}))`)
    .eq('id', id)
    .maybeSingle();
  if (error) {
    if (/invalid input syntax for type uuid/i.test(error.message)) return null;
    fail(error, "Couldn't load this crew.");
  }
  return data as unknown as CrewDetail | null;
}

export async function createCrew(name: string, courtId: string | null, schedule: string): Promise<{ id: string }> {
  const { data, error } = await supabase.rpc('create_crew', {
    p_name: name,
    p_court_id: courtId,
    p_schedule: schedule,
  });
  if (error) {
    if (/check constraint|crews_name_check/i.test(error.message)) throw new Error('Crew names need 2 to 40 characters.');
    fail(error, "Couldn't create the crew.");
  }
  return data as { id: string };
}

export async function fetchCrewPreview(code: string): Promise<CrewPreview | null> {
  const { data, error } = await supabase.rpc('crew_preview', { p_code: code });
  if (error) fail(error, "Couldn't load this invite.");
  const rows = (data ?? []) as CrewPreview[];
  return rows[0] ?? null;
}

export async function joinCrew(code: string): Promise<string> {
  const { data, error } = await supabase.rpc('join_crew', { p_code: code });
  if (error) fail(error, "Couldn't join the crew.");
  return data as string;
}

export async function leaveCrew(crewId: string, userId: string): Promise<void> {
  const { error } = await supabase.from('crew_members').delete().eq('crew_id', crewId).eq('user_id', userId);
  if (error) fail(error, "Couldn't leave the crew.");
}

export async function deleteCrew(crewId: string): Promise<void> {
  await removeCrewPhotos(crewId);
  const { error } = await supabase.from('crews').delete().eq('id', crewId);
  if (error) fail(error, "Couldn't delete the crew.");
}

/** Remove files before deleting their crew, while owner access still exists. */
async function removeCrewPhotos(crewId: string): Promise<void> {
  const bucket = supabase.storage.from('crew-photos');
  for (;;) {
    const { data: files, error } = await bucket.list(crewId, { limit: 100 });
    if (error) fail(error, "Couldn't check the crew photos. Try again.");
    if (!files?.length) return;
    const { error: removeError } = await bucket.remove(files.map(file => `${crewId}/${file.name}`));
    if (removeError) fail(removeError, "Couldn't remove the crew photo. Try again.");
    if (files.length < 100) return;
  }
}
