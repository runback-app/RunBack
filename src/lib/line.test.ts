import { describe, expect, it } from 'vitest';
import { courtTag, freeAgentLine, freeAgents, groupLine, myLineState, placeLabel, teamName, type LineRow } from './line';

const row = (team: string, user: string, name: string, captain = 'a'): LineRow => ({
  team_id: team,
  team_created_at: `2026-11-04T01:00:0${team === 't1' ? 0 : 5}Z`,
  captain_id: captain,
  user_id: user,
  joined_at: '2026-11-04T01:00:00Z',
  display_name: name,
  avatar_url: null,
});

const rows = [row('t1', 'a', 'Marcus Lee'), row('t1', 'b', 'Tre'), row('t2', 'c', 'DJ', 'c')];

describe('groupLine', () => {
  it('keeps team order and players together', () => {
    const teams = groupLine(rows);
    expect(teams.map((t) => t.id)).toEqual(['t1', 't2']);
    expect(teams[0].players.map((p) => p.userId)).toEqual(['a', 'b']);
  });
  it('handles an empty line', () => {
    expect(groupLine([])).toEqual([]);
  });
});

describe('freeAgents', () => {
  it('is everyone checked in who is not on a team, earliest first', () => {
    const here = [
      { user_id: 'z', created_at: '2026-11-04T01:05:00Z' },
      { user_id: 'a', created_at: '2026-11-04T01:00:00Z' },
      { user_id: 'y', created_at: '2026-11-04T01:01:00Z' },
    ];
    expect(freeAgents(here, groupLine(rows)).map((c) => c.user_id)).toEqual(['y', 'z']);
  });
});

describe('myLineState', () => {
  const teams = groupLine(rows);
  it('knows when you are signed out or not here', () => {
    expect(myLineState(null, false, teams).kind).toBe('signed-out');
    expect(myLineState('x', false, teams).kind).toBe('not-here');
  });
  it('makes you a free agent when checked in without a team', () => {
    expect(myLineState('x', true, teams).kind).toBe('free-agent');
  });
  it('finds your team and place', () => {
    const first = myLineState('b', true, teams);
    expect(first).toMatchObject({ kind: 'on-team', place: 1, first: true, captain: false });
    const second = myLineState('c', true, teams);
    expect(second).toMatchObject({ kind: 'on-team', place: 2, first: false, captain: true });
  });
});

describe('labels', () => {
  it('numbers places with two digits', () => {
    expect(placeLabel(1)).toBe('01');
    expect(placeLabel(12)).toBe('12');
  });
  it('names teams by captain first name, or yours', () => {
    const [t1] = groupLine(rows);
    expect(teamName(t1, 'x')).toBe("Marcus's team");
    expect(teamName(t1, 'b')).toBe('Your team');
  });
  it('tags courts', () => {
    expect(courtTag(0, 0)).toEqual({ label: 'Empty', tone: 'empty' });
    expect(courtTag(6, 0)).toEqual({ label: 'No line · walk on', tone: 'open' });
    expect(courtTag(23, 1).label).toBe('1 team waiting');
    expect(courtTag(23, 3)).toEqual({ label: '3 teams waiting', tone: 'wait' });
  });
  it('counts free agents', () => {
    expect(freeAgentLine(1)).toBe('1 free agent');
    expect(freeAgentLine(4)).toBe('4 free agents');
  });
});
