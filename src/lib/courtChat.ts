import { supabase as db } from './supabase';
import type { PlayerBrief } from './types';

/** Court chat: one open chat per court. Signed-in players only; messages clear after 24 hours. */
export type CourtMessage = {
  id: string;
  user_id: string;
  body: string;
  created_at: string;
  profiles: PlayerBrief | null;
};

export const COURT_CHAT_MAX = 500;

function check(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

/** Trims a message and makes sure it's 1 to 500 characters. */
export function cleanCourtMessage(body: string): string {
  const text = body.trim();
  if (!text) throw new Error('Write a message first.');
  if (text.length > COURT_CHAT_MAX) throw new Error(`Keep it under ${COURT_CHAT_MAX} characters.`);
  return text;
}

/** "just now", "5 min ago", "3 hr ago". */
export function ago(iso: string, now: Date): string {
  const minutes = Math.floor((now.getTime() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  return `${Math.floor(minutes / 60)} hr ago`;
}

export async function getCourtMessages(courtId: string): Promise<CourtMessage[]> {
  const { data, error } = await db
    .from('court_messages')
    // Reports also link messages to profiles; select the author relationship explicitly.
    .select('id,user_id,body,created_at,profiles!court_messages_user_id_fkey(display_name,avatar_url,position,skill,height_in)')
    .eq('court_id', courtId)
    .order('created_at', { ascending: false })
    .limit(100);
  check(error);
  return (data as unknown as CourtMessage[]).reverse();
}

export async function sendCourtMessage(courtId: string, userId: string, body: string) {
  const { error } = await db
    .from('court_messages')
    .insert({ court_id: courtId, user_id: userId, body: cleanCourtMessage(body) });
  check(error);
}

export async function removeCourtMessage(id: string) {
  const { error } = await db.from('court_messages').delete().eq('id', id);
  check(error);
}

export async function reportCourtMessage(messageId: string, userId: string) {
  const { error } = await db.from('court_message_reports').insert({ message_id: messageId, reporter_id: userId });
  // 23505 = already reported. That's fine.
  if (error && (error as { code?: string }).code !== '23505') throw new Error(error.message);
}
