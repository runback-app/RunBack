import { describe, expect, it } from 'vitest';
import { nativeInvitePath } from './nativeInvite';

describe('nativeInvitePath', () => {
  it.each([
    ['https://runback.net/join/A1B2C3D4E5', '/join/a1b2c3d4e5'],
    ['https://runback.net/join/a1b2c3d4e5f60718293a/', '/join/a1b2c3d4e5f60718293a'],
  ])('routes %s to the existing crew join screen', (url, path) => {
    expect(nativeInvitePath(url)).toBe(path);
  });

  it.each([
    'https://runback.net.example.org/join/a1b2c3d4e5',
    'https://user@runback.net/join/a1b2c3d4e5',
    'http://runback.net/join/a1b2c3d4e5',
    'https://runback.net/join/invalid',
    'https://runback.net/join/a1b2c3d4e5/extra',
    'https://runback.net/join/a1b2c3d4e5?code=confirmation',
    'https://runback.net/join/a1b2c3d4e5#type=signup',
    'https://runback.net/reset-password#type=recovery',
    '/join/a1b2c3d4e5',
  ])('does not route %s', (url) => {
    expect(nativeInvitePath(url)).toBeNull();
  });
});
