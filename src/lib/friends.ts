import { supabase as db } from './supabase';

/**
 * Friends. Send a request (search, player card, or friend link), the other player accepts.
 * Blocking someone also ends the friendship. All writes go through database functions.
 */
export type FriendState = 'friends' | 'incoming' | 'outgoing';

export type FriendRow = {
  id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
  state: FriendState;
  since: string;
};

export type PlayerHit = {
  id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
};

function check(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

/** "@Ray_Allen " -> "Ray_Allen". Returns null if it can't be a username. Capitals are kept. */
export function cleanUsername(input: string): string | null {
  const u = input.trim().replace(/^@/, '');
  return /^[A-Za-z0-9_]{3,20}$/.test(u) ? u : null;
}

/** The note shown under the username box when it's not allowed. */
export function usernameProblem(input: string): string | null {
  const u = input.trim().replace(/^@/, '');
  if (u.length < 3) return 'Use at least 3 characters.';
  if (u.length > 20) return 'Keep it to 20 characters or less.';
  if (!/^[a-zA-Z0-9_]+$/.test(u)) return 'Only letters, numbers, and _ (no spaces).';
  return null;
}

export function friendUrl(origin: string, username: string): string {
  return `${origin.replace(/\/+$/, '')}/add/${username}`;
}

export function friendSmsHref(url: string): string {
  return `sms:?&body=${encodeURIComponent(`Add me on Runback: ${url}`)}`;
}

/** Sends a request. Returns 'friends' if they had already asked you (so it's accepted now). */
export async function sendFriendRequest(playerId: string): Promise<'sent' | 'friends'> {
  const { data, error } = await db.rpc('send_friend_request', { p_user_id: playerId });
  check(error);
  return data as 'sent' | 'friends';
}

export async function acceptFriendRequest(playerId: string) {
  const { error } = await db.rpc('accept_friend_request', { p_user_id: playerId });
  check(error);
}

/** Decline, cancel, or unfriend. */
export async function removeFriend(playerId: string) {
  const { error } = await db.rpc('remove_friend', { p_user_id: playerId });
  check(error);
}

export async function getMyFriends(): Promise<FriendRow[]> {
  const { data, error } = await db.rpc('my_friends');
  check(error);
  return (data ?? []) as FriendRow[];
}

export async function searchPlayers(query: string): Promise<PlayerHit[]> {
  if (query.trim().replace(/^@/, '').length < 2) return [];
  const { data, error } = await db.rpc('search_players', { p_query: query });
  check(error);
  return (data ?? []) as PlayerHit[];
}

/** Finds a player by username, ignoring capitals (for friend links). */
export async function findByUsername(username: string): Promise<PlayerHit | null> {
  const u = cleanUsername(username);
  if (!u) return null;
  const { data, error } = await db.rpc('find_player', { p_username: u });
  check(error);
  return ((data ?? []) as PlayerHit[])[0] ?? null;
}

/** Split the list into the three groups the Friends page shows. */
export function groupFriends(rows: FriendRow[]) {
  return {
    incoming: rows.filter((r) => r.state === 'incoming'),
    friends: rows.filter((r) => r.state === 'friends'),
    outgoing: rows.filter((r) => r.state === 'outgoing'),
  };
}
