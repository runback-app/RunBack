import { describe, expect, it, vi, beforeEach } from 'vitest';
const fake = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('./supabase', () => ({ supabase: fake }));
import { updateRun, stopSeries } from './social';

describe('run mutation receipts', () => {
  beforeEach(() => fake.from.mockReset());
  for (const [name, action] of [
    ['cancel one date', () => updateRun('run-id', { cancelled: true })],
    ['stop schedule', () => stopSeries('series-id')],
  ] as const) {
    it(`${name} rejects a silent permission failure`, async () => {
      const q = { update: vi.fn(), eq: vi.fn(), select: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) };
      q.update.mockReturnValue(q); q.eq.mockReturnValue(q); q.select.mockReturnValue(q); fake.from.mockReturnValue(q);
      await expect(action()).rejects.toThrow('crew owner');
    });
    it(`${name} accepts a returned row`, async () => {
      const q = { update: vi.fn(), eq: vi.fn(), select: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'id' }, error: null }) };
      q.update.mockReturnValue(q); q.eq.mockReturnValue(q); q.select.mockReturnValue(q); fake.from.mockReturnValue(q);
      await expect(action()).resolves.toBeUndefined();
    });
    it(`${name} surfaces database errors`, async () => {
      const q = { update: vi.fn(), eq: vi.fn(), select: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: { message: 'connection lost' } }) };
      q.update.mockReturnValue(q); q.eq.mockReturnValue(q); q.select.mockReturnValue(q); fake.from.mockReturnValue(q);
      await expect(action()).rejects.toThrow('connection lost');
    });
  }
});
