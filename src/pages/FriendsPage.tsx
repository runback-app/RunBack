import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { useLoad } from '../hooks';
import { blockPlayer, blockWarning } from '../lib/blocks';
import {
  acceptFriendRequest,
  friendSmsHref,
  friendUrl,
  getMyFriends,
  groupFriends,
  removeFriend,
  searchPlayers,
  sendFriendRequest,
  type FriendRow,
  type PlayerHit,
} from '../lib/friends';
import { Avatar, ErrorNote, Loading } from '../components';

export function FriendsPage() {
  const { userId, ready, profile } = useAuth();
  const friends = useLoad(() => (userId ? getMyFriends() : Promise.resolve([])), [userId]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (ready && !userId) {
    return (
      <section className="page narrow">
        <h1 className="page-title">Sign in to add friends</h1>
        <p>
          <Link className="btn btn-primary" to="/login?next=/friends">
            Sign in
          </Link>
        </p>
      </section>
    );
  }
  if (!profile || (friends.loading && !friends.data)) return <Loading label="Loading friends" />;

  async function run(id: string, action: () => Promise<unknown>) {
    setBusyId(id);
    setError(null);
    try {
      await action();
      await friends.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Try again.');
    } finally {
      setBusyId(null);
    }
  }

  const rows = friends.data ?? [];
  const { incoming, friends: mine, outgoing } = groupFriends(rows);
  const known = new Map(rows.map((r) => [r.id, r.state]));

  return (
    <div className="page narrow">
      <h1 className="page-title">Friends</h1>
      {(error || friends.error) && <ErrorNote>{error ?? friends.error}</ErrorNote>}

      <FindPlayers known={known} busyId={busyId} onAdd={(id) => void run(id, () => sendFriendRequest(id))} />

      {incoming.length > 0 && (
        <section className="panel">
          <h2>Friend requests</h2>
          <ul className="friend-list">
            {incoming.map((f) => (
              <FriendItem key={f.id} f={f}>
                <button className="btn btn-primary" disabled={busyId === f.id} onClick={() => void run(f.id, () => acceptFriendRequest(f.id))}>
                  Accept
                </button>
                <button className="btn btn-quiet" disabled={busyId === f.id} onClick={() => void run(f.id, () => removeFriend(f.id))}>
                  Decline
                </button>
              </FriendItem>
            ))}
          </ul>
        </section>
      )}

      <section className="panel">
        <h2>Your friends{mine.length > 0 ? ` (${mine.length})` : ''}</h2>
        {mine.length === 0 ? (
          <p className="muted">No friends yet. Search for a name above or send your friend link.</p>
        ) : (
          <ul className="friend-list">
            {mine.map((f) => (
              <FriendItem key={f.id} f={f}>
                <details className="friend-menu">
                  <summary className="btn btn-quiet">More</summary>
                  <div className="friend-menu-items">
                    <button
                      className="link-button"
                      disabled={busyId === f.id}
                      onClick={() => {
                        if (window.confirm(`Remove ${f.display_name} from your friends?`)) void run(f.id, () => removeFriend(f.id));
                      }}
                    >
                      Remove friend
                    </button>
                    <button
                      className="link-button danger-link"
                      disabled={busyId === f.id}
                      onClick={() => {
                        if (window.confirm(blockWarning(f.display_name) + ' This also removes them from your friends.'))
                          void run(f.id, () => blockPlayer(f.id));
                      }}
                    >
                      Block
                    </button>
                  </div>
                </details>
              </FriendItem>
            ))}
          </ul>
        )}
      </section>

      {outgoing.length > 0 && (
        <section className="panel">
          <h2>Waiting on them</h2>
          <ul className="friend-list">
            {outgoing.map((f) => (
              <FriendItem key={f.id} f={f}>
                <button className="btn btn-quiet" disabled={busyId === f.id} onClick={() => void run(f.id, () => removeFriend(f.id))}>
                  Cancel
                </button>
              </FriendItem>
            ))}
          </ul>
        </section>
      )}

      <FriendLink username={profile.username} />
    </div>
  );
}

function FriendItem({ f, children }: { f: FriendRow | PlayerHit; children: React.ReactNode }) {
  return (
    <li>
      <Link to={`/player/${f.id}`} className="friend-who">
        <Avatar name={f.display_name} url={f.avatar_url} size={40} seed={f.id} />
        <span>
          <strong>{f.display_name}</strong>
        </span>
      </Link>
      <span className="friend-actions">{children}</span>
    </li>
  );
}

function FindPlayers({
  known,
  busyId,
  onAdd,
}: {
  known: Map<string, FriendRow['state']>;
  busyId: string | null;
  onAdd: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(query), 250);
    return () => window.clearTimeout(t);
  }, [query]);
  const hits = useLoad(() => searchPlayers(debounced), [debounced]);
  const list = hits.data ?? [];
  const searching = debounced.trim().replace(/^@/, '').length >= 2;

  return (
    <section className="panel">
      <h2>Add a friend</h2>
      <label className="field">
        <span>Search by name</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Their Runback name"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
      </label>
      {hits.error && <ErrorNote>{hits.error}</ErrorNote>}
      {searching && !hits.loading && list.length === 0 && <p className="muted">No players found.</p>}
      {list.length > 0 && (
        <ul className="friend-list">
          {list.map((p) => {
            const state = known.get(p.id);
            return (
              <FriendItem key={p.id} f={p}>
                {state === 'friends' ? (
                  <span className="muted">Friends</span>
                ) : state === 'outgoing' ? (
                  <span className="muted">Requested</span>
                ) : (
                  <button className="btn btn-primary" disabled={busyId === p.id} onClick={() => onAdd(p.id)}>
                    {state === 'incoming' ? 'Accept' : 'Add'}
                  </button>
                )}
              </FriendItem>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function FriendLink({ username }: { username: string }) {
  const url = friendUrl(window.location.origin, username);
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt('Copy this link', url);
    }
  }

  return (
    <section className="panel invite">
      <h2>Your friend link</h2>
      <p className="muted">
        Send this to anyone. They tap it to add you. Your name is <strong>{username}</strong> (change it on{' '}
        <Link to="/me">your profile</Link>).
      </p>
      <p className="invite-url">{url}</p>
      <div className="form-actions">
        <a className="btn btn-primary" href={friendSmsHref(url)}>
          Text my link
        </a>
        <button className="btn btn-quiet" onClick={copy}>
          {copied ? 'Link copied' : 'Copy link'}
        </button>
        {canShare && (
          <button className="btn btn-quiet" onClick={() => navigator.share({ title: 'Runback', text: 'Add me on Runback', url }).catch(() => undefined)}>
            Share
          </button>
        )}
      </div>
    </section>
  );
}
