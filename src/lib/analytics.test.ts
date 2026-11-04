import { describe, expect, it } from 'vitest';
import { cleanPageUrl } from './analytics';

describe('cleanPageUrl', () => {
  it('hides invite codes', () => {
    expect(cleanPageUrl('https://runback.net/join/a1b2c3d4e5')).toBe(
      'https://runback.net/join/[code]',
    );
  });

  it('hides crew and player ids', () => {
    expect(cleanPageUrl('/crew/31a6ccbb-3079-4f73-b63b-c012d5826496')).toBe('/crew/[id]');
    expect(cleanPageUrl('/player/31a6ccbb-3079-4f73-b63b-c012d5826496')).toBe('/player/[id]');
  });

  it('hides run identifiers',()=>{expect(cleanPageUrl('/run/private-id')).toBe('/run/[id]');});

  it('drops query strings and hashes', () => {
    expect(cleanPageUrl('https://runback.net/login?next=/join/abc#x')).toBe(
      'https://runback.net/login',
    );
  });

  it('leaves normal pages alone', () => {
    expect(cleanPageUrl('https://runback.net/court/reid-park')).toBe(
      'https://runback.net/court/reid-park',
    );
  });
});
