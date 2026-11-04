import { supabase as db } from './supabase';

/**
 * Block a player. Works both ways: neither of you sees the other's court chat messages,
 * and a captain can't pull a blocked player onto their team. The blocked player is never told.
 */
export type BlockedPlayer = {
  blocked_id: string;
  created_at: string;
  profiles: { display_name: string; avatar_url: string | null } | null;
};

function check(error: { message: string; code?: string } | null) {
  if (error) throw new Error(error.message);
}

/** What the confirm box says before blocking someone. */
export function blockWarning(name: string): string {
  return `Block ${name}? You won't see each other's court chat messages, and they can't be added to your team. They won't be told. You can unblock them from your profile.`;
}

export async function blockPlayer(playerId: string) {
  const { error } = await db.from('player_blocks').insert({ blocked_id: playerId });
  // 23505 = already blocked. That's fine.
  if (error && error.code !== '23505') throw new Error(error.message);
}

export async function unblockPlayer(playerId: string) {
  const { error } = await db.from('player_blocks').delete().eq('blocked_id', playerId);
  check(error);
}

/** Has the signed-in player blocked this player? */
export async function isBlocked(playerId: string): Promise<boolean> {
  const { data, error } = await db.from('player_blocks').select('blocked_id').eq('blocked_id', playerId).maybeSingle();
  check(error);
  return Boolean(data);
}

/** Everyone the signed-in player has blocked, newest first. */
export async function getMyBlocks(): Promise<BlockedPlayer[]> {
  const { data, error } = await db
    .from('player_blocks')
    // Two links to profiles (blocker and blocked); name the one we want.
    .select('blocked_id,created_at,profiles!player_blocks_blocked_id_fkey(display_name,avatar_url)')
    .order('created_at', { ascending: false });
  check(error);
  return data as unknown as BlockedPlayer[];
}
