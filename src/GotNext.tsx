import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from './auth';
import { usePlay } from './data';
import { useLoad, useNow } from './hooks';
import { addFreeAgent, fetchCourtLine, leaveTeam, putMeOnTeam, startTeam, teamOn } from './lib/api';
import {
  TEAM_SIZE,
  freeAgentLine,
  freeAgents,
  groupLine,
  myLineState,
  placeLabel,
  teamName,
  type Team,
} from './lib/line';
import { isLive } from './lib/time';
import type { Court } from './lib/types';
import { ErrorNote } from './components';

/**
 * "Got next" at a court: free agents pinned on top (★, not numbered),
 * then the line of teams, oldest first. One main button that changes with where you are.
 */
export function GotNext({ court }: { court: Court }) {
  const { userId } = useAuth();
  const { live, myCheckin, lineCounts, refresh } = usePlay();
  const location = useLocation();
  const now = useNow(15000);
  const line = useLoad(
    () => (userId ? fetchCourtLine(court.id) : Promise.resolve([])),
    [userId, court.id, myCheckin?.id],
    15000,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wentOn, setWentOn] = useState(false);

  // Database change not run yet: keep the page as it was.
  if (line.data === null) return null;

  const teams = groupLine(line.data ?? []);
  const here = live.filter((c) => c.court_id === court.id && isLive(c, now));
  const agents = freeAgents(here, teams);
  const checkedInHere = myCheckin?.court_id === court.id;
  const me = myLineState(userId, checkedInHere, teams);
  const canAdd = me.kind === 'on-team' && me.captain && me.team.players.length < TEAM_SIZE;

  async function run(action: () => Promise<void>, after?: () => void) {
    setBusy(true);
    setError(null);
    try {
      await action();
      after?.();
      await Promise.all([line.reload(), refresh()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  }

  const signedOutCounts = lineCounts[court.id];
  const waiting = userId ? teams.length : signedOutCounts?.teams ?? 0;

  return (
    <section className="gotnext" aria-labelledby="gotnext-title">
      {me.kind === 'on-team' && me.first && (
        <div className="upnext" role="status">
          <strong>You're up next</strong>
          <span>Your team is first in line. Get ready.</span>
        </div>
      )}

      <div className="gotnext-head">
        <h2 id="gotnext-title" className="display-title">
          Teams
        </h2>
        <span className="gotnext-note">
          {canAdd
            ? 'Tap a free agent to add them'
            : waiting > 0
              ? `${waiting} waiting · clear after 1 hr`
              : 'Teams clear after 1 hr'}
        </span>
      </div>

      {!userId ? (
        <div className="line-empty">
          <strong>{waiting > 0 ? `${waiting} ${waiting === 1 ? 'team' : 'teams'} waiting` : 'No teams waiting'}</strong>
          <span>
            <Link to={`/login?next=${encodeURIComponent(location.pathname)}`}>Sign in</Link> to see the teams and get in line.
          </span>
        </div>
      ) : (
        <ol className="line" aria-label="Got next line">
          {agents.length > 0 && (
            <li className="line-card line-free">
              <span className="line-place" aria-hidden="true">
                ★
              </span>
              <div className="line-body">
                <div className="line-top">
                  <span className="line-name">Free agents</span>
                  <span className="line-count">{freeAgentLine(agents.length)}</span>
                </div>
                {canAdd ? (
                  <div className="agent-chips">
                    {agents.map((a) => (
                      <button
                        key={a.user_id}
                        className="agent-chip"
                        disabled={busy || a.user_id === userId}
                        aria-label={`Add ${a.profiles?.display_name ?? 'this player'} to your team`}
                        onClick={() => void run(() => addFreeAgent(a.user_id))}
                      >
                        + {firstName(a.profiles?.display_name)}
                      </button>
                    ))}
                  </div>
                ) : (
                  <span className="line-players">
                    {agents.map((a) => (a.user_id === userId ? 'You' : firstName(a.profiles?.display_name))).join(', ')}
                  </span>
                )}
              </div>
            </li>
          )}

          {teams.length === 0 && (
            <li className="line-empty">
              <strong>No teams waiting</strong>
              <span>Next game is open. Just walk on.</span>
            </li>
          )}

          {teams.map((team, i) => (
            <TeamCard key={team.id} team={team} place={i + 1} userId={userId} />
          ))}
        </ol>
      )}

      {userId && (
        <div className="line-actions">
          <ActionArea
            state={me}
            wentOn={wentOn}
            busy={busy}
            onPutMeOn={() => void run(() => putMeOnTeam(court.id), () => setWentOn(false))}
            onStart={() => void run(() => startTeam(court.id), () => setWentOn(false))}
            onLeave={() => void run(leaveTeam)}
            onWeOn={(teamId) => void run(() => teamOn(teamId), () => setWentOn(true))}
          />
          {error && <ErrorNote>{error}</ErrorNote>}
        </div>
      )}
    </section>
  );
}

function TeamCard({ team, place, userId }: { team: Team; place: number; userId: string | null }) {
  const n = team.players.length;
  const full = n >= TEAM_SIZE;
  const mine = !!userId && team.players.some((p) => p.userId === userId);
  return (
    <li className={`line-card${mine ? ' mine' : ''}${place === 1 ? ' first' : ''}${full ? ' full' : ''}`}>
      <span className="line-place">{placeLabel(place)}</span>
      <div className="line-body">
        <div className="line-top">
          <span className="line-name">
            {teamName(team, userId)}
            {place === 1 && <span className="line-upnext"> · Up next</span>}
          </span>
          <span className={full ? 'line-count full' : 'line-count'}>{full ? 'Full' : `${n}/${TEAM_SIZE}`}</span>
        </div>
        <span className="line-bars" aria-hidden="true">
          {Array.from({ length: TEAM_SIZE }, (_, k) => (
            <span key={k} className={k < n ? 'on' : undefined} />
          ))}
        </span>
        <span className="line-players">
          {team.players.map((p) => (p.userId === userId ? 'You' : firstName(p.name))).join(', ')}
          {!full && ` · ${TEAM_SIZE - n} open`}
        </span>
      </div>
    </li>
  );
}

function ActionArea({
  state,
  wentOn,
  busy,
  onPutMeOn,
  onStart,
  onLeave,
  onWeOn,
}: {
  state: ReturnType<typeof myLineState>;
  wentOn: boolean;
  busy: boolean;
  onPutMeOn: () => void;
  onStart: () => void;
  onLeave: () => void;
  onWeOn: (teamId: string) => void;
}) {
  if (state.kind === 'signed-out') return null;
  if (state.kind === 'not-here') {
    return <p className="line-hint">Tap I'm here to get in line. You'll be a free agent until you join a team.</p>;
  }
  if (state.kind === 'free-agent') {
    return (
      <>
        <p className="line-hint">
          {wentOn ? "You're on. Have a good run. Tap below when you want back in line." : "You're a free agent. A captain can add you, or jump in yourself:"}
        </p>
        <button className="btn btn-big" disabled={busy} onClick={onPutMeOn}>
          Put me on a team
        </button>
        <button className="btn btn-quiet btn-block" disabled={busy} onClick={onStart}>
          Start my own team
        </button>
      </>
    );
  }
  if (state.first) {
    return (
      <>
        <p className="line-hint">Tap when your team steps on the court.</p>
        <button className="btn btn-big" disabled={busy} onClick={() => onWeOn(state.team.id)}>
          We're on
        </button>
        <button className="btn btn-quiet btn-block" disabled={busy} onClick={onLeave}>
          Leave team
        </button>
      </>
    );
  }
  return (
    <>
      <p className="line-hint">
        You're #{state.place} in line. We'll buzz your phone when you're up
        {' '}(<Link to="/me#alerts">turn on alerts</Link>).
      </p>
      <button className="btn btn-quiet btn-block" disabled={busy} onClick={onLeave}>
        Leave team
      </button>
    </>
  );
}

function firstName(name: string | null | undefined): string {
  return (name ?? 'Player').trim().split(/\s+/)[0] || 'Player';
}
