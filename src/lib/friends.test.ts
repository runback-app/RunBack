import { describe, expect, it } from 'vitest';
import { cleanUsername, friendSmsHref, friendUrl, groupFriends, usernameProblem, type FriendRow } from './friends';

describe('usernames', () => {
  it('cleans @ and capitals', () => {
    expect(cleanUsername(' @Ray_Allen ')).toBe('ray_allen');
  });
  it('rejects bad ones', () => {
    expect(cleanUsername('ab')).toBeNull();
    expect(cleanUsername('has space')).toBeNull();
    expect(cleanUsername('a'.repeat(21))).toBeNull();
  });
  it('explains what is wrong', () => {
    expect(usernameProblem('ab')).toMatch(/at least 3/);
    expect(usernameProblem('ray allen')).toMatch(/no spaces/);
    expect(usernameProblem('ray_allen')).toBeNull();
  });
});

describe('friend links', () => {
  it('builds the link and text', () => {
    const url = friendUrl('https://runback.net/', 'ray');
    expect(url).toBe('https://runback.net/add/ray');
    expect(friendSmsHref(url)).toContain(encodeURIComponent(url));
  });
});

describe('groupFriends', () => {
  it('splits by state', () => {
    const row = (id: string, state: FriendRow['state']): FriendRow => ({
      id, display_name: id, username: id, avatar_url: null, state, since: '',
    });
    const g = groupFriends([row('a', 'friends'), row('b', 'incoming'), row('c', 'outgoing')]);
    expect(g.friends.map((r) => r.id)).toEqual(['a']);
    expect(g.incoming.map((r) => r.id)).toEqual(['b']);
    expect(g.outgoing.map((r) => r.id)).toEqual(['c']);
  });
});
