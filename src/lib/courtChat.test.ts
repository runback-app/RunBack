import { describe, it, expect, vi } from 'vitest';
vi.mock('./supabase', () => ({ supabase: {} }));
import { COURT_CHAT_MAX, ago, cleanCourtMessage } from './courtChat';

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
