import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth';
import { useLoad } from '../hooks';
import { findByUsername, getMyFriends, sendFriendRequest } from '../lib/friends';
import { Avatar, ErrorNote, Loading } from '../components';

/** runback.net/add/<username> — the friend link players text each other. */
export function AddFriendPage() {
  const { username = '' } = useParams();
  const { userId, ready } = useAuth();
  const player = useLoad(() => (userId ? findByUsername(username) : Promise.resolve(null)), [username, userId]);
  const friends = useLoad(() => (userId ? getMyFriends() : Promise.resolve([])), [userId]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<'sent' | 'friends' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const next = `/add/${encodeURIComponent(username)}`;

  if (ready && !userId) {
    return (
      <section className="page narrow">
        <div className="panel join-card">
          <p className="muted">You got a friend link for</p>
          <h1 className="page-title">@{username}</h1>
          <p>Sign in or make an account to add them on Runback.</p>
          <div className="form-actions">
            <Link className="btn btn-primary" to={`/login?mode=signup&next=${encodeURIComponent(next)}`}>
              Create an account
            </Link>
            <Link className="btn btn-quiet" to={`/login?next=${encodeURIComponent(next)}`}>
              Sign in
            </Link>
          </div>
        </div>
      </section>
    );
  }
  if (!ready || (player.loading && !player.data)) return <Loading label="Opening friend link" />;
  if (player.error) return <ErrorNote>{player.error}</ErrorNote>;

  const p = player.data;
  if (!p) {
    return (
      <section className="page narrow">
        <h1 className="page-title">No player with that username</h1>
        <p className="muted">They may have changed it. Ask them for a new link, or search on the Friends page.</p>
        <p>
          <Link to="/friends">Go to Friends</Link>
        </p>
      </section>
    );
  }

  const state = done ?? friends.data?.find((f) => f.id === p.id)?.state;
  const isMe = p.id === userId;

  return (
    <section className="page narrow">
      <div className="panel join-card">
        <Avatar name={p.display_name} url={p.avatar_url} size={88} seed={p.id} />
        <h1 className="page-title">{p.display_name}</h1>
        <p className="muted">@{p.username}</p>
        {isMe ? (
          <p>This is your own friend link. Send it to people so they can add you.</p>
        ) : state === 'friends' ? (
          <p>You're friends. <Link to="/friends">See your friends</Link></p>
        ) : state === 'sent' || state === 'outgoing' ? (
          <p>Request sent. They'll see it on their Friends page.</p>
        ) : (
          <button
            className="btn btn-primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                setDone(await sendFriendRequest(p.id));
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Try again.');
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? 'Adding…' : state === 'incoming' ? `Accept ${p.display_name}` : `Add ${p.display_name}`}
          </button>
        )}
        {error && <ErrorNote>{error}</ErrorNote>}
        <p>
          <Link to={`/player/${p.id}`}>See player card</Link>
        </p>
      </div>
    </section>
  );
}
