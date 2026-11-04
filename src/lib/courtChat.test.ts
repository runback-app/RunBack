import { describe, it, expect, vi } from 'vitest';
const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));
vi.mock('./supabase', async () => {
  const { createClient } = await import('@supabase/supabase-js');
  return {
    supabase: createClient('https://court-chat.test', 'test-publishable-key', {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: fetchMock },
    }),
  };
});
import { COURT_CHAT_MAX, ago, cleanCourtMessage, getCourtMessages } from './courtChat';

describe('court chat author lookup', () => {
  it('uses the author relationship when reports provide a second route to profiles', async () => {
    const newer = { id: 'new', user_id: 'player-1', body: 'At 6?', created_at: '2026-11-04T18:00:00Z', profiles: { display_name: 'Author' } };
    const older = { id: 'old', user_id: 'player-2', body: 'Yes', created_at: '2026-11-04T17:00:00Z', profiles: null };
    fetchMock.mockImplementationOnce(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      expect(url.pathname).toBe('/rest/v1/court_messages');
      expect(url.searchParams.get('select')).toBe('id,user_id,body,created_at,profiles!court_messages_user_id_fkey(display_name,avatar_url,position,skill,height_in)');
      expect(url.searchParams.get('court_id')).toBe('eq.north-rec-id');
      expect(url.searchParams.get('order')).toBe('created_at.desc');
      expect(url.searchParams.get('limit')).toBe('100');
      return new Response(JSON.stringify([newer, older]), { headers: { 'Content-Type': 'application/json' } });
    });
    expect(await getCourtMessages('north-rec-id')).toEqual([older, newer]);
  });
});

describe('court chat messages', () => {
  it('trims messages', () => {
    expect(cleanCourtMessage('  anyone at 6?  ')).toBe('anyone at 6?');
  });
  it('rejects empty messages', () => {
    expect(() => cleanCourtMessage('   ')).toThrow('Write a message first.');
  });
  it('allows exactly the max length and rejects longer', () => {
    expect(cleanCourtMessage('a'.repeat(COURT_CHAT_MAX))).toHaveLength(COURT_CHAT_MAX);
    expect(() => cleanCourtMessage('a'.repeat(COURT_CHAT_MAX + 1))).toThrow();
  });
});

describe('court chat times', () => {
  const now = new Date('2026-11-03T01:00:00Z');
  it('shows just now under a minute', () => {
    expect(ago('2026-11-03T00:59:30Z', now)).toBe('just now');
  });
  it('shows minutes under an hour', () => {
    expect(ago('2026-11-03T00:48:00Z', now)).toBe('12 min ago');
  });
  it('shows hours after that', () => {
    expect(ago('2026-11-02T22:00:00Z', now)).toBe('3 hr ago');
  });
  it('treats a slightly ahead device clock as just now', () => {
    expect(ago('2026-11-03T01:00:20Z', now)).toBe('just now');
  });
});
