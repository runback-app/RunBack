import { Link, useLocation, useParams } from 'react-router-dom';
import { useAuth } from '../auth';
import { usePlay } from '../data';
import { useLoad, useNow } from '../hooks';
import { fetchLiveCheckins } from '../lib/api';
import { courtStatus, weekRows } from '../lib/hours';
import { playersHere } from '../lib/run';
import { clockTime, isLive } from '../lib/time';
import { CheckInControl, ErrorNote, Loading, RunMeter, StatusPill } from '../components';

export function CourtPage() {
  const { slug } = useParams();
  const { userId } = useAuth();
  const { courts, courtsLoading, activity, myCheckin } = usePlay();
  const location = useLocation();
  const now = useNow();
  const court = courts.find((c) => c.slug === slug);

  // Reload the list when my own check-in changes so I show up right away.
  const live = useLoad(
    () => (userId && court ? fetchLiveCheckins(court.id) : Promise.resolve([])),
    [userId, court?.id, myCheckin?.id, myCheckin?.court_id],
    30000,
  );

  if (!court) {
    if (courtsLoading) return <Loading label="Loading court" />;
    return (
      <section className="section narrow">
        <h1 className="page-title">Court not found</h1>
        <p>
          <Link to="/">See all courts</Link>
        </p>
      </section>
    );
  }

  const players = live.data ? live.data.filter((c) => isLive(c, now)) : null;
  const count = players ? players.length : activity[court.id] ?? 0;
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${court.name}, ${court.address}`)}`;

  return (
    <article className="section narrow court-page">
      <p className="crumb">
        <Link to="/">All courts</Link>
      </p>
      <h1 className="page-title">{court.name}</h1>
      <p className="court-meta">
        {court.kind === 'indoor' ? 'Indoor' : 'Outdoor'}, {court.area}
      </p>
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
        ) : live.error ? (
          <ErrorNote>{live.error}</ErrorNote>
        ) : !players ? (
          <Loading />
        ) : players.length === 0 ? (
          <p className="muted">Nobody yet. Check in and let people know there's a run.</p>
        ) : (
          <ul className="people">
            {players.map((p) => (
              <li key={p.id}>
                <span className="person-name">
                  {p.profiles?.display_name ?? 'Player'}
                  {p.user_id === userId && <span className="you"> (you)</span>}
                </span>
                <span className="person-time">
                  since {clockTime(p.created_at)}, until {clockTime(p.expires_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

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
        {court.note && <p className="muted">{court.note}</p>}
      </section>

      <section className="subsection">
        <h2>Getting there</h2>
        <p>{court.address}</p>
        <p>
          <a className="text-link" href={mapsUrl} target="_blank" rel="noreferrer">
            Open in Maps
          </a>
        </p>
      </section>
    </article>
  );
}
