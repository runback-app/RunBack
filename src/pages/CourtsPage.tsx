import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { usePlay } from '../data';
import { useNow } from '../hooks';
import { courtStatus } from '../lib/hours';
import { playersHere } from '../lib/run';
import { CheckInControl, ErrorNote, Loading, RunMeter, StatusPill } from '../components';

type Filter = 'all' | 'indoor' | 'outdoor';

export function CourtsPage() {
  const { userId } = useAuth();
  const { courts, courtsError, courtsLoading, activity } = usePlay();
  const now = useNow();
  const [filter, setFilter] = useState<Filter>('all');

  const shown = courts.filter((c) => filter === 'all' || c.kind === filter);
  const total = Object.values(activity).reduce((sum, n) => sum + n, 0);
  const activeCourts = Object.values(activity).filter((n) => n > 0).length;

  return (
    <>
      <section className="court-hero">
        <div className="court-lines" aria-hidden="true" />
        <h1>Who's at the court?</h1>
        <p className="hero-sub">
          {total === 0
            ? 'Nobody is checked in yet. Be the first and get a run going.'
            : total === 1
              ? '1 player is checked in right now.'
              : activeCourts === 1
                ? `${total} players are checked in right now.`
                : `${total} players are checked in at ${activeCourts} courts right now.`}
        </p>
        {!userId && (
          <p className="hero-cta">
            <Link className="btn btn-light" to="/login?mode=signup">
              Create your account
            </Link>
            <Link className="hero-link" to="/login">
              Sign in
            </Link>
          </p>
        )}
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Tucson courts</h2>
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

        <ul className="court-list">
          {shown.map((court) => {
            const players = activity[court.id] ?? 0;
            return (
              <li key={court.id} className="court-row">
                <div className="court-main">
                  <Link to={`/court/${court.slug}`} className="court-name">
                    {court.name}
                  </Link>
                  <p className="court-meta">
                    {court.kind === 'indoor' ? 'Indoor' : 'Outdoor'}, {court.area}
                  </p>
                  <StatusPill status={courtStatus(court.hours, now)} />
                </div>
                <div className="court-play">
                  <p className="court-count">{playersHere(players)}</p>
                  <RunMeter players={players} />
                </div>
                <div className="court-action">
                  <CheckInControl court={court} compact />
                  <Link to={`/court/${court.slug}`} className="text-link">
                    {userId ? "See who's here" : 'Hours and details'}
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
        <p className="fine">Hours come from each court's posted schedule. Holidays and game days can change them.</p>
      </section>
    </>
  );
}
