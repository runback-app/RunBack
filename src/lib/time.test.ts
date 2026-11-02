import { describe, expect, it } from 'vitest';
import { clockTime, isLive, timeLeft } from './time';

const now = new Date('2026-11-02T21:00:00Z'); // 2:00 PM in Tucson
const plus = (minutes: number) => new Date(now.getTime() + minutes * 60000).toISOString();

describe('timeLeft', () => {
  it('shows hours and minutes', () => {
    expect(timeLeft(plus(72), now)).toBe('1h 12m left');
    expect(timeLeft(plus(120), now)).toBe('2h left');
  });

  it('shows minutes under an hour', () => {
    expect(timeLeft(plus(8), now)).toBe('8 min left');
    expect(timeLeft(plus(0.5), now)).toBe('1 min left');
    expect(timeLeft(plus(0.1), now)).toBe('1 min left');
  });

  it('ignores a few seconds of clock difference', () => {
    expect(timeLeft(plus(120.4), now)).toBe('2h left');
  });

  it('handles expired check-ins', () => {
    expect(timeLeft(plus(0), now)).toBe('ending now');
    expect(timeLeft(plus(-5), now)).toBe('ending now');
  });
});

describe('clockTime', () => {
  it('shows Tucson time', () => {
    expect(clockTime('2026-11-03T01:12:00Z')).toBe('6:12 PM');
  });
});

describe('isLive', () => {
  it('is live before it expires', () => {
    expect(isLive({ expires_at: plus(30) }, now)).toBe(true);
  });

  it('is not live after it expires', () => {
    expect(isLive({ expires_at: plus(-1) }, now)).toBe(false);
  });

  it('is not live after the player leaves', () => {
    expect(isLive({ expires_at: plus(30), ended_at: plus(-1) }, now)).toBe(false);
  });
});
