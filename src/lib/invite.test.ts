import { describe, expect, it } from 'vitest';
import { inviteUrl, parseInviteCode, smsHref } from './invite';

describe('inviteUrl', () => {
  it('builds a join link', () => {
    expect(inviteUrl('https://runback.vercel.app/', 'a1b2c3d4e5')).toBe('https://runback.vercel.app/join/a1b2c3d4e5');
  });
});

describe('smsHref', () => {
  it('fills in the text message', () => {
    const href = smsHref('Tuesday Run', 'https://runback.vercel.app/join/a1b2c3d4e5');
    expect(href.startsWith('sms:?&body=')).toBe(true);
    expect(decodeURIComponent(href.replace('sms:?&body=', ''))).toBe(
      'Run with Tuesday Run on Runback: https://runback.vercel.app/join/a1b2c3d4e5',
    );
  });
});

describe('parseInviteCode', () => {
  it('accepts a bare code', () => {
    expect(parseInviteCode('a1b2c3d4e5')).toBe('a1b2c3d4e5');
  });

  it('accepts a full link', () => {
    expect(parseInviteCode('https://runback.vercel.app/join/A1B2C3D4E5?x=1')).toBe('a1b2c3d4e5');
  });

  it('rejects junk', () => {
    expect(parseInviteCode('')).toBeNull();
    expect(parseInviteCode('hello')).toBeNull();
    expect(parseInviteCode("'; drop table crews;--")).toBeNull();
  });
});
