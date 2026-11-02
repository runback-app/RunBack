import { lazy, Suspense, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useAuth } from '../auth';
import { usePlay } from '../data';
import { useNow } from '../hooks';
import { courtStatus, weekRows } from '../lib/hours';
import { playersHere } from '../lib/run';
import { clockTime, isLive } from '../lib/time';
import type { Court } from '../lib/types';
import { CheckInControl, ErrorNote, FavoriteButton, Loading, PlayerRow, RunMeter, StatusPill } from '../components';

const CourtMap = lazy(() => import('../CourtMap'));

export function CourtPage() {
  const { slug } = useParams();
  const { userId } = useAuth();
  const { courts, courtsLoading, activity, live, liveLoaded } = usePlay();
  const location = useLocation();
  const now = useNow();
  const court = courts.find((c) => c.slug === slug);

  if (!court) {
    if (courtsLoading) return <Loading label="Loading court" />;
    return (
      <section className="page narrow">
        <h1 className="page-title">Court not found</h1>
        <p>
          <Link to="/">See all courts</Link>
        </p>
      </section>
    );
  }

  const players = live.filter((c) => c.court_id === court.id && isLive(c, now));
  const count = userId && liveLoaded ? players.length : activity[court.id] ?? 0;
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${court.name}, ${court.address}`)}`;

  return (
    <article className="page narrow court-page">
      <p className="crumb">
        <Link to="/">All courts</Link>
      </p>
      <div className="title-row">
        <div>
          <h1 className="page-title">{court.name}</h1>
          <p className="court-meta">
            {court.kind === 'indoor' ? 'Indoor' : 'Outdoor'}, {court.area}
          </p>
        </div>
        <FavoriteButton court={court} />
      </div>
      <StatusPill status={courtStatus(court.hours, now)} />

      <div className="panel">
        <p className="court-count big">{playersHere(count)}</p>
        <RunMeter players={count} size="lg" />
        <CheckInControl court={court} />
      </div>

      <section className="subsection">
        <h2>Who's here</h2>
        {!userId ? (
          <p className="muted">
            <Link to={`/login?next=${encodeURIComponent(location.pathname)}`}>Sign in</Link> to see who's playing.
          </p>
        ) : !liveLoaded && players.length === 0 ? (
          <Loading />
        ) : players.length === 0 ? (
          <p className="muted">Nobody yet. Check in and let people know there's a run.</p>
        ) : (
          <ul className="players card-list">
            {players.map((p) => (
              <PlayerRow
                key={p.id}
                userId={p.user_id}
                profile={p.profiles}
                you={p.user_id === userId}
                detail={`until ${clockTime(p.expires_at)}`}
              />
            ))}
          </ul>
        )}
      </section>

      {userId && <CourtAlerts court={court} />}

      <section className="subsection">
        <h2>Hours</h2>
        <table className="hours">
          <tbody>
            {weekRows(court.hours, now).map((row) => (
              <tr key={row.day} className={row.today ? 'today' : undefined}>
                <th scope="row">{row.today ? `${row.day} (today)` : row.day}</th>
                <td>{row.hours}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {court.note && <p className="muted note">{court.note}</p>}
      </section>

      <section className="subsection">
        <h2>Getting there</h2>
        <div className="map-card small">
          <Suspense fallback={<div className="map map-loading" style={{ height: 200 }} />}>
            <CourtMap courts={courts} activity={activity} focusId={court.id} height={200} />
          </Suspense>
        </div>
        <p className="address">{court.address}</p>
        <p>
          <a className="text-link" href={mapsUrl} target="_blank" rel="noreferrer">
            Get directions
          </a>
        </p>
      </section>
    </article>
  );
}

const ALERT_OPTIONS = [2, 4, 6, 8, 10];

function CourtAlerts({ court }: { court: Court }) {
  const { favorites, setFavorite, changeFavorite } = usePlay();
  const fav = favorites.find((f) => f.court_id === court.id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="subsection">
      <h2>Court alerts</h2>
      {!fav ? (
        <div className="alert-box">
          <p>Get a heads up when people start playing here.</p>
          <button className="btn btn-quiet" disabled={busy} onClick={() => run(() => setFavorite(court.id, true))}>
            Add to your courts
          </button>
        </div>
      ) : (
        <div className="alert-box">
          <label className="switch-row">
            <input
              type="checkbox"
              checked={fav.alerts}
              disabled={busy}
              onChange={(e) => run(() => changeFavorite(court.id, { alerts: e.target.checked }))}
            />
            <span>Alert me when a run starts here</span>
          </label>
          {fav.alerts && (
            <label className="field inline">
              <span>When this many are checked in</span>
              <select
                value={fav.alert_at}
                disabled={busy}
                onChange={(e) => run(() => changeFavorite(court.id, { alert_at: Number(e.target.value) }))}
              >
                {ALERT_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n} players
                  </option>
                ))}
              </select>
            </label>
          )}
          <p className="fine">
            Alerts go to devices where you turned them on in <Link to="/me#alerts">your profile</Link>.
          </p>
        </div>
      )}
      {error && <ErrorNote>{error}</ErrorNote>}
    </section>
  );
}
