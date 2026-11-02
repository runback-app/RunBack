import { describe, expect, it } from 'vitest';
import { avatarColor, formatHeight, initials, playerSummary, positionLabel, skillLabel } from './profile';

describe('formatHeight', () => {
  it('formats feet and inches', () => {
    expect(formatHeight(74)).toBe(`6'2"`);
    expect(formatHeight(72)).toBe(`6'0"`);
  });

  it('ignores missing or silly heights', () => {
    expect(formatHeight(null)).toBeNull();
    expect(formatHeight(30)).toBeNull();
    expect(formatHeight(120)).toBeNull();
  });
});

describe('playerSummary', () => {
  it('joins only what the player filled in', () => {
    expect(playerSummary({ position: 'PG', height_in: 74, skill: 'competitive' })).toBe(`PG, 6'2", Competitive`);
    expect(playerSummary({ skill: 'fun' })).toBe('Just for fun');
    expect(playerSummary({})).toBe('');
  });
});

describe('labels', () => {
  it('maps codes to words', () => {
    expect(positionLabel('C')).toBe('Center');
    expect(skillLabel('college')).toBe('Played in college');
    expect(positionLabel('XX')).toBeNull();
  });
});

describe('initials', () => {
  it('uses first and last name', () => {
    expect(initials('Alex Test')).toBe('AT');
    expect(initials('  bo  ')).toBe('B');
    expect(initials('Mary Kate Olsen')).toBe('MO');
    expect(initials('')).toBe('?');
  });
});

describe('avatarColor', () => {
  it('is the same every time for the same name', () => {
    expect(avatarColor('Alex')).toBe(avatarColor('Alex'));
    expect(avatarColor('Alex')).toMatch(/^#[0-9a-f]{6}$/);
  });
});
