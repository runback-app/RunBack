import { lazy, Suspense, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth';
import { usePlay } from '../data';
import { useNow } from '../hooks';
import { courtStatus } from '../lib/hours';
import { courtTag, freeAgentLine } from '../lib/line';
import { isLive, timeAgo } from '../lib/time';
import type { Court } from '../lib/types';
import { ErrorNote, Loading, PlayerRow } from '../components';

const CourtMap = lazy(() => import('../CourtMap'));

type View = 'list' | 'map';

/** Home: a clean list of courts with live player counts. The map sits behind a List/Map switch. */
export function CourtsPage() {
  const { userId } = useAuth();
  const { courts, courtsError, courtsLoading, activity, activityLoaded, live, isFavorite } = usePlay();
  const now = useNow();
  const [view, setView] = useState<View>('list');
  const [params] = useSearchParams();
  const justDeleted = params.get('deleted') === '1';

  const total = Object.values(activity).reduce((sum, n) => sum + n, 0);
  const mine = courts.filter((c) => isFavorite(c.id));
  const others = courts.filter((c) => !isFavorite(c.id));
  const recent = live.filter((c) => isLive(c, now)).slice(0, 5);
  const courtFor = (id: string) => courts.find((c) => c.id === id);

  return (
    <div className="page home">
      {justDeleted && (
        <p className="notice" role="status">
          Your account and everything tied to it has been deleted.
        </p>
      )}

      <header className="home-head">
        <div className="home-intro">
          <p className="home-eyebrow">Tucson pickup basketball</p>
          <h1 className="page-title">Find your next run.</h1>
          <p className="home-sub">See who’s at the court before you head out.</p>
          {activityLoaded && (
            <p className={total > 0 ? 'home-activity has-players' : 'home-activity'}>
              {total === 0 ? 'Nobody checked in yet' : `${total} ${total === 1 ? 'player' : 'players'} checked in`}
            </p>
          )}
        </div>
      </header>

      <div className="court-toolbar">
        <h2>Tucson courts</h2>
        <div className="court-view" role="group" aria-label="Show courts as">
          <button aria-pressed={view === 'list'} onClick={() => setView('list')}>
            List
          </button>
          <button aria-pressed={view === 'map'} onClick={() => setView('map')}>
            Map
          </button>
        </div>
      </div>

      {courtsLoading && courts.length === 0 && <Loading label="Loading courts" />}
      {courtsError && <ErrorNote>{courtsError}</ErrorNote>}

      {view === 'map' ? (
        <div className="map-card">
          <Suspense fallback={<div className="map map-loading" style={{ height: 420 }} />}>
            <CourtMap courts={courts} activity={activity} height={420} />
          </Suspense>
        </div>
      ) : (
        <>
          {mine.length > 0 && (
            <>
              <h3 className="list-label">Your courts</h3>
              <CourtList courts={mine} now={now} />
              {others.length > 0 && <h3 className="list-label">More courts</h3>}
            </>
          )}
          <CourtList courts={others} now={now} />
        </>
      )}

      {!userId && (
        <div className="join-strip">
          <p>Check in, build a crew, get a heads up when a run starts.</p>
          <Link className="btn btn-primary btn-small" to="/login?mode=signup">
            Join
          </Link>
        </div>
      )}

      {userId && recent.length > 0 && (
        <section className="section-block">
          <h2 className="list-label">Just checked in</h2>
          <ul className="players card-list">
            {recent.map((c) => {
              const court = courtFor(c.court_id);
              return (
                <PlayerRow
                  key={c.id}
                  userId={c.user_id}
                  profile={c.profiles}
                  you={c.user_id === userId}
                  detail={
                    <>
                      {court ? <Link to={`/court/${court.slug}`}>{court.name}</Link> : 'a court'}
                      <span className="muted">, {timeAgo(c.created_at, now)}</span>
                    </>
                  }
                />
              );
            })}
          </ul>
        </section>
      )}

      {userId && mine.length === 0 && (
        <p className="fine">Star a court on its page to pin it here and get alerts when a run starts.</p>
      )}
      <p className="fine">Hours come from each court's posted schedule. Holidays and game days can change them.</p>
    </div>
  );
}

function CourtList({ courts, now }: { courts: Court[]; now: Date }) {
  const { activity, lineCounts } = usePlay();
  if (courts.length === 0) return null;
  // Busiest courts first; ties keep the usual order.
  const sorted = [...courts].sort((a, b) => (activity[b.id] ?? 0) - (activity[a.id] ?? 0));
  return (
    <ul className="court-list">
      {sorted.map((court) => {
        const players = activity[court.id] ?? 0;
        const line = lineCounts[court.id];
        const tag = courtTag(players, line?.teams ?? 0);
        const status = courtStatus(court.hours, now);
        return (
          <li key={court.id}>
            <Link to={`/court/${court.slug}`} className={tag.tone === 'wait' ? 'court-row busy' : 'court-row'}>
              <span className="court-row-text">
                <span className="court-row-name">{court.name}</span>
                <span className={`court-row-meta status-${status.tone}`}>{status.label}</span>
                <span className={`line-tag tag-${tag.tone}`}>{tag.label}</span>
                {players > 0 && line && line.freeAgents > 0 && (
                  <span className="court-row-meta">{freeAgentLine(line.freeAgents)}</span>
                )}
              </span>
              <span className={players > 0 ? 'court-row-count live' : 'court-row-count'}>
                <span className="court-row-num">{players}</span>
                <span className="court-row-here">{players === 1 ? 'Player here' : 'Players here'}</span>
              </span>
              <svg className="court-row-arrow" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
