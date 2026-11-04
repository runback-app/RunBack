import { describe, it, expect, vi, beforeEach } from 'vitest';
const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));
vi.mock('./supabase', async () => {
  const { createClient } = await import('@supabase/supabase-js');
  return {
    supabase: createClient('https://blocks.test', 'test-publishable-key', {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: fetchMock },
    }),
  };
});
import { blockPlayer, blockWarning, getMyBlocks } from './blocks';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

beforeEach(() => fetchMock.mockReset());

describe('block a player', () => {
  it('only sends the blocked player id (the database fills in who is blocking)', async () => {
    fetchMock.mockImplementationOnce(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(new URL(String(input)).pathname).toBe('/rest/v1/player_blocks');
      expect(JSON.parse(String(init?.body))).toEqual({ blocked_id: 'player-2' });
      return new Response(null, { status: 201 });
    });
    await blockPlayer('player-2');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('treats blocking someone twice as fine', async () => {
    fetchMock.mockResolvedValueOnce(json({ code: '23505', message: 'duplicate key value' }, 409));
    await expect(blockPlayer('player-2')).resolves.toBeUndefined();
  });

  it('shows other errors', async () => {
    fetchMock.mockResolvedValueOnce(json({ code: '42501', message: 'permission denied' }, 403));
    await expect(blockPlayer('player-2')).rejects.toThrow('permission denied');
  });

  it('names the blocked-player link when loading the block list', async () => {
    fetchMock.mockImplementationOnce(async (input: RequestInfo | URL) => {
      const select = new URL(String(input)).searchParams.get('select') ?? '';
      expect(select).toContain('profiles!player_blocks_blocked_id_fkey');
      return json([{ blocked_id: 'player-2', created_at: '2026-11-04T18:00:00Z', profiles: { display_name: 'Ray', avatar_url: null } }]);
    });
    const list = await getMyBlocks();
    expect(list[0].profiles?.display_name).toBe('Ray');
  });

  it('warns that the blocked player is not told', () => {
    const text = blockWarning('Ray');
    expect(text).toContain('Block Ray?');
    expect(text).toContain("won't be told");
  });
});
