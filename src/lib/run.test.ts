import { describe, expect, it } from 'vitest';
import { playersHere, runMeter } from './run';

describe('runMeter', () => {
  it('handles an empty court', () => {
    expect(runMeter(0)).toEqual({ filled: 0, waiting: 0, label: 'Nobody checked in' });
  });

  it('counts down to a full run', () => {
    expect(runMeter(7)).toEqual({ filled: 7, waiting: 0, label: '3 more for 5 on 5' });
    expect(runMeter(9).label).toBe('1 more for 5 on 5');
  });

  it('shows a full run', () => {
    expect(runMeter(10)).toEqual({ filled: 10, waiting: 0, label: 'Full run' });
  });

  it('shows people waiting for next', () => {
    expect(runMeter(13)).toEqual({ filled: 10, waiting: 3, label: 'Full run, 3 waiting' });
  });

  it('ignores bad numbers', () => {
    expect(runMeter(-2).filled).toBe(0);
    expect(runMeter(Number.NaN).filled).toBe(0);
  });
});

describe('playersHere', () => {
  it('uses the right word', () => {
    expect(playersHere(1)).toBe('1 player here');
    expect(playersHere(4)).toBe('4 players here');
  });
});
