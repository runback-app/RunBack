import { supabase } from './supabase';
import type { Checkin, Court, CrewDetail, CrewPreview, CrewSummary, LiveCheckin } from './types';

// Turns Supabase/Postgres errors into short messages people can act on.
function fail(error: { message?: string } | null, fallback: string): never {
  const raw = error?.message ?? '';
  if (/failed to fetch|network/i.test(raw)) throw new Error("Can't reach Runback. Check your connection and try again.");
  if (/jwt|not signed in|sign in/i.test(raw)) throw new Error(raw.includes('Sign in') ? raw : 'Sign in to do that.');
  throw new Error(raw || fallback);
}

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

/** Live check-ins with names. Only works when signed in. */
export async function fetchLiveCheckins(courtId?: string): Promise<LiveCheckin[]> {
  let query = supabase
    .from('checkins')
    .select('id, court_id, user_id, created_at, expires_at, ended_at, profiles(display_name)')
    .is('ended_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at');
  if (courtId) query = query.eq('court_id', courtId);
  const { data, error } = await query;
  if (error) fail(error, "Couldn't load who's here.");
  return data as unknown as LiveCheckin[];
}

export async function fetchMyCheckin(userId: string): Promise<Checkin | null> {
  const { data, error } = await supabase
    .from('checkins')
    .select('*')
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
    .select('*, courts(name, slug), crew_members(user_id, role, joined_at, profiles(display_name))')
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
  const { error } = await supabase.from('crews').delete().eq('id', crewId);
  if (error) fail(error, "Couldn't delete the crew.");
}

export async function updateDisplayName(userId: string, name: string): Promise<void> {
  const { error } = await supabase.from('profiles').update({ display_name: name.trim() }).eq('id', userId);
  if (error) fail(error, "Couldn't save your name.");
}
