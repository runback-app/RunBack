import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { blockPlayer, blockWarning, isBlocked, unblockPlayer } from '../lib/blocks';
import { acceptFriendRequest, getMyFriends, removeFriend, sendFriendRequest } from '../lib/friends';
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
          <p className="muted player-username">@{p.username}</p>
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
      {!isMe && <FriendControl playerId={p.id} name={p.display_name} />}
      {!isMe && facts.length === 0 && !p.bio && <p className="muted">{p.display_name} hasn't filled in a profile yet.</p>}
      {!isMe && <BlockControl playerId={p.id} name={p.display_name} />}
    </article>
  );
}

/** Block / unblock this player. Quiet link at the bottom of their card. */
function BlockControl({ playerId, name }: { playerId: string; name: string }) {
  const blocked = useLoad(() => isBlocked(playerId), [playerId]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<void>, failure: string) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await blocked.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : failure);
    } finally {
      setBusy(false);
    }
  }

  if (blocked.loading && blocked.data === undefined) return null;

  return (
    <section className="block-control">
      {blocked.data ? (
        <>
          <p className="muted">
            You blocked {name}. You won't see each other's court chat messages.
          </p>
          <button className="btn btn-quiet" disabled={busy} onClick={() => void run(() => unblockPlayer(playerId), 'Could not unblock.')}>
            {busy ? 'Unblocking…' : `Unblock ${name}`}
          </button>
        </>
      ) : (
        <button
          className="link-button danger-link"
          disabled={busy}
          onClick={() => {
            if (window.confirm(blockWarning(name))) void run(() => blockPlayer(playerId), 'Could not block.');
          }}
        >
          Block {name}
        </button>
      )}
      {(error || blocked.error) && <ErrorNote>{error ?? blocked.error}</ErrorNote>}
    </section>
  );
}

/** Add friend / Accept / Requested / Friends, on someone else's player card. */
function FriendControl({ playerId, name }: { playerId: string; name: string }) {
  const friends = useLoad(() => getMyFriends(), [playerId]);
  const blocked = useLoad(() => isBlocked(playerId), [playerId]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (friends.data === undefined || blocked.data === undefined || blocked.data) return null;
  const state = friends.data.find((f) => f.id === playerId)?.state;

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await friends.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="form-actions">
      {state === 'friends' ? (
        <>
          <span className="muted">You're friends</span>
          <button
            className="btn btn-quiet"
            disabled={busy}
            onClick={() => {
              if (window.confirm(`Remove ${name} from your friends?`)) void run(() => removeFriend(playerId));
            }}
          >
            Remove friend
          </button>
        </>
      ) : state === 'outgoing' ? (
        <button className="btn btn-quiet" disabled={busy} onClick={() => void run(() => removeFriend(playerId))}>
          Requested · Cancel
        </button>
      ) : state === 'incoming' ? (
        <button className="btn btn-primary" disabled={busy} onClick={() => void run(() => acceptFriendRequest(playerId))}>
          Accept friend request
        </button>
      ) : (
        <button className="btn btn-primary" disabled={busy} onClick={() => void run(() => sendFriendRequest(playerId))}>
          {busy ? 'Adding…' : 'Add friend'}
        </button>
      )}
      {error && <ErrorNote>{error}</ErrorNote>}
    </div>
  );
}
