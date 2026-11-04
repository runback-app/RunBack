// "Got next": the line of teams waiting at a court, plus the free agents
// (checked in, not on a team). Pure helpers so they're easy to test.

export const TEAM_SIZE = 5;

/** One row from the database's court_line(): a player on a team. */
export type LineRow = {
  team_id: string;
  team_created_at: string;
  captain_id: string;
  user_id: string;
  joined_at: string;
  display_name: string | null;
  avatar_url: string | null;
};

export type LinePlayer = { userId: string; name: string; avatarUrl: string | null };

export type Team = {
  id: string;
  createdAt: string;
  captainId: string;
  players: LinePlayer[];
};

/** Rows come back sorted by team then join time. Keep that order. */
export function groupLine(rows: LineRow[]): Team[] {
  const teams: Team[] = [];
  const byId = new Map<string, Team>();
  for (const row of rows) {
    let team = byId.get(row.team_id);
    if (!team) {
      team = { id: row.team_id, createdAt: row.team_created_at, captainId: row.captain_id, players: [] };
      byId.set(row.team_id, team);
      teams.push(team);
    }
    team.players.push({ userId: row.user_id, name: row.display_name ?? 'Player', avatarUrl: row.avatar_url });
  }
  return teams;
}

/** Checked-in players who aren't on a team, earliest check-in first. */
export function freeAgents<T extends { user_id: string; created_at: string }>(here: T[], teams: Team[]): T[] {
  const onTeam = new Set(teams.flatMap((t) => t.players.map((p) => p.userId)));
  return here.filter((c) => !onTeam.has(c.user_id)).sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export type MyLineState =
  | { kind: 'signed-out' }
  | { kind: 'not-here' }
  | { kind: 'free-agent' }
  | { kind: 'on-team'; team: Team; place: number; captain: boolean; first: boolean };

export function myLineState(userId: string | null, checkedInHere: boolean, teams: Team[]): MyLineState {
  if (!userId) return { kind: 'signed-out' };
  if (!checkedInHere) return { kind: 'not-here' };
  const index = teams.findIndex((t) => t.players.some((p) => p.userId === userId));
  if (index < 0) return { kind: 'free-agent' };
  const team = teams[index];
  return { kind: 'on-team', team, place: index + 1, captain: team.captainId === userId, first: index === 0 };
}

/** "01", "02"... for the line. */
export function placeLabel(place: number): string {
  return String(place).padStart(2, '0');
}

export function teamName(team: Team, userId: string | null): string {
  if (userId && team.players.some((p) => p.userId === userId)) return 'Your team';
  const captain = team.players.find((p) => p.userId === team.captainId) ?? team.players[0];
  const first = (captain?.name ?? 'Player').trim().split(/\s+/)[0];
  return `${first}'s team`;
}

export type CourtTag = { label: string; tone: 'wait' | 'open' | 'empty' };

/** The one tag on each court in the list. */
export function courtTag(here: number, teams: number): CourtTag {
  if (here <= 0) return { label: 'Empty', tone: 'empty' };
  if (teams > 0) return { label: teams === 1 ? '1 team waiting' : `${teams} teams waiting`, tone: 'wait' };
  return { label: 'No line · walk on', tone: 'open' };
}

export function freeAgentLine(count: number): string {
  return count === 1 ? '1 free agent' : `${count} free agents`;
}
