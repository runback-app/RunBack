import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth';
import { usePlay } from '../data';
import { useLoad, useNow } from '../hooks';
import { fetchProfile } from '../lib/api';
import { formatHeight, positionLabel, skillLabel } from '../lib/profile';
import { isLive, timeLeft } from '../lib/time';
import { Avatar, ErrorNote, Loading } from '../components';

export function PlayerPage() {
  const { id = '' } = useParams();
  const { userId, ready } = useAuth();
  const { courts, live } = usePlay();
  const now = useNow();
  const player = useLoad(() => (userId ? fetchProfile(id) : Promise.resolve(null)), [id, userId]);

  if (ready && !userId) {
    return (
      <section className="page narrow">
        <h1 className="page-title">Sign in to see players</h1>
        <p>
          <Link className="btn btn-primary" to={`/login?next=/player/${id}`}>
            Sign in
          </Link>
        </p>
      </section>
    );
  }
  if (player.loading && !player.data) return <Loading label="Loading player" />;
  if (player.error) return <ErrorNote>{player.error}</ErrorNote>;
  const p = player.data;
  if (!p) {
    return (
      <section className="page narrow">
        <h1 className="page-title">Player not found</h1>
        <p>
          <Link to="/">See courts</Link>
        </p>
      </section>
    );
  }

  const homeCourt = courts.find((c) => c.id === p.home_court_id);
  const playing = live.find((c) => c.user_id === p.id && isLive(c, now));
  const playingCourt = playing ? courts.find((c) => c.id === playing.court_id) : undefined;
  const facts = [
    { label: 'Position', value: positionLabel(p.position) },
    { label: 'Height', value: formatHeight(p.height_in) },
    { label: 'Level', value: skillLabel(p.skill) },
  ].filter((f) => f.value);
  const isMe = p.id === userId;

  return (
    <article className="page narrow player-page">
      <div className="player-hero">
        <Avatar name={p.display_name} url={p.avatar_url} size={104} seed={p.id} />
        <div>
          <h1 className="page-title">{p.display_name}</h1>
          {playing && playingCourt ? (
            <p className="playing-now">
              <span className="live-dot" aria-hidden="true" /> Playing at{' '}
              <Link to={`/court/${playingCourt.slug}`}>{playingCourt.name}</Link>, {timeLeft(playing.expires_at, now)}
            </p>
          ) : homeCourt ? (
            <p className="muted">
              Usually at <Link to={`/court/${homeCourt.slug}`}>{homeCourt.name}</Link>
            </p>
          ) : null}
        </div>
      </div>

      {facts.length > 0 && (
        <dl className="facts">
          {facts.map((f) => (
            <div key={f.label} className="fact">
              <dt>{f.label}</dt>
              <dd>{f.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {p.bio && <p className="bio">{p.bio}</p>}

      {isMe && (
        <p>
          <Link className="btn btn-quiet" to="/me">
            Edit your profile
          </Link>
        </p>
      )}
      {!isMe && facts.length === 0 && !p.bio && <p className="muted">{p.display_name} hasn't filled in a profile yet.</p>}
    </article>
  );
}
