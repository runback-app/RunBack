import { lazy, Suspense, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { usePlay } from '../data';
import { useNow } from '../hooks';
import { courtStatus } from '../lib/hours';
import { isLive, timeAgo } from '../lib/time';
import type { Court } from '../lib/types';
import { AvatarStack, CheckInControl, ErrorNote, FavoriteButton, Loading, PlayerRow, RunMeter, StatusPill } from '../components';

const CourtMap = lazy(() => import('../CourtMap'));

type Filter = 'all' | 'indoor' | 'outdoor';

export function CourtsPage() {
  const { userId } = useAuth();
  const { courts, courtsError, courtsLoading, activity, live, isFavorite } = usePlay();
  const now = useNow();
  const [filter, setFilter] = useState<Filter>('all');

  const total = Object.values(activity).reduce((sum, n) => sum + n, 0);
  const shown = courts.filter((c) => filter === 'all' || c.kind === filter);
  const mine = shown.filter((c) => isFavorite(c.id));
  const others = shown.filter((c) => !isFavorite(c.id));
  const recent = live.filter((c) => isLive(c, now)).slice(0, 5);
  const courtName = (id: string) => courts.find((c) => c.id === id);

  return (
    <div className="page">
      <header className="home-head">
        <h1 className="page-title">Who's playing</h1>
        <p className="live-line">
          {total > 0 && <span className="live-dot" aria-hidden="true" />}
          {total === 0
            ? 'Nobody is checked in yet. Be the first and get a run going.'
            : total === 1
              ? '1 player checked in right now'
              : `${total} players checked in right now`}
        </p>
      </header>

      {!userId && (
        <section className="intro">
          <div className="court-lines" aria-hidden="true" />
          <h2>See who's at the court before you go.</h2>
          <p>Check in when you get there, build a crew for your regular run, and get a heads up when a game starts.</p>
          <p className="intro-cta">
            <Link className="btn btn-light" to="/login?mode=signup">
              Create your account
            </Link>
            <Link className="intro-link" to="/login">
              Sign in
            </Link>
          </p>
        </section>
      )}

      <div className="map-card">
        <Suspense fallback={<div className="map map-loading" style={{ height: 260 }} />}>
          <CourtMap courts={courts} activity={activity} />
        </Suspense>
      </div>

      {userId && recent.length > 0 && (
        <section className="section-block">
          <h2 className="block-title">Just checked in</h2>
          <ul className="players card-list">
            {recent.map((c) => {
              const court = courtName(c.court_id);
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

      <section className="section-block">
        <div className="block-head">
          <h2 className="block-title">Courts</h2>
          <div className="filters" role="group" aria-label="Filter courts">
            {(['all', 'indoor', 'outdoor'] as Filter[]).map((f) => (
              <button
                key={f}
                className={filter === f ? 'filter on' : 'filter'}
                aria-pressed={filter === f}
                onClick={() => setFilter(f)}
              >
                {f === 'all' ? 'All' : f === 'indoor' ? 'Indoor' : 'Outdoor'}
              </button>
            ))}
          </div>
        </div>

        {courtsLoading && courts.length === 0 && <Loading label="Loading courts" />}
        {courtsError && <ErrorNote>{courtsError}</ErrorNote>}

        {mine.length > 0 && (
          <>
            <h3 className="group-title">Your courts</h3>
            <div className="court-grid">
              {mine.map((court) => (
                <CourtCard key={court.id} court={court} now={now} />
              ))}
            </div>
            {others.length > 0 && <h3 className="group-title">More courts</h3>}
          </>
        )}
        <div className="court-grid">
          {others.map((court) => (
            <CourtCard key={court.id} court={court} now={now} />
          ))}
        </div>
        {userId && mine.length === 0 && (
          <p className="fine">Tap the star on a court to pin it here and get alerts when a run starts.</p>
        )}
        <p className="fine">Hours come from each court's posted schedule. Holidays and game days can change them.</p>
      </section>
    </div>
  );
}

function CourtCard({ court, now }: { court: Court; now: Date }) {
  const { userId } = useAuth();
  const { activity, live } = usePlay();
  const players = activity[court.id] ?? 0;
  const here = live.filter((c) => c.court_id === court.id && isLive(c, now));

  return (
    <article className={players > 0 ? 'court-card has-players' : 'court-card'}>
      <div className="court-card-top">
        <div className="court-card-title">
          <Link to={`/court/${court.slug}`} className="court-name">
            {court.name}
          </Link>
          <p className="court-meta">
            {court.kind === 'indoor' ? 'Indoor' : 'Outdoor'}, {court.area}
          </p>
        </div>
        <div className="court-count-box" aria-label={`${players} checked in`}>
          <span className="court-count-num">{players}</span>
          <span className="court-count-label">{players === 1 ? 'player' : 'players'}</span>
        </div>
        <FavoriteButton court={court} />
      </div>
      <StatusPill status={courtStatus(court.hours, now)} />
      <RunMeter players={players} />
      <div className="court-card-foot">
        {userId && here.length > 0 ? (
          <Link to={`/court/${court.slug}`} className="stack-link" aria-label={`See who's at ${court.name}`}>
            <AvatarStack people={here.map((c) => ({ id: c.user_id, profile: c.profiles }))} />
          </Link>
        ) : (
          <Link to={`/court/${court.slug}`} className="text-link">
            Details
          </Link>
        )}
        <CheckInControl court={court} compact />
      </div>
    </article>
  );
}
