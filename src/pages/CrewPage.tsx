import { CrewRuns } from '../RunTools';
import { Chat } from '../Chat';
import { CrewSettings, CrewPicture } from '../CrewSettings';
import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth';
import { usePlay } from '../data';
import { useLoad, useNow } from '../hooks';
import { deleteCrew, fetchCrew, leaveCrew } from '../lib/api';
import { inviteUrl, smsHref } from '../lib/invite';
import { isLive, timeLeft } from '../lib/time';
import { ErrorNote, Loading, PlayerRow } from '../components';

export function CrewPage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const { userId, ready } = useAuth();
  const { courts, live } = usePlay();
  const navigate = useNavigate();
  const now = useNow();
  const crew = useLoad(() => (userId ? fetchCrew(id) : Promise.resolve(null)), [id, userId]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (ready && !userId) {
    return (
      <section className="page narrow">
        <h1 className="page-title">Sign in to see this crew</h1>
        <p>
          <Link className="btn btn-primary" to={`/login?next=/crew/${id}`}>
            Sign in
          </Link>
        </p>
      </section>
    );
  }
  if (crew.loading && !crew.data) return <Loading label="Loading crew" />;
  if (crew.error) return <ErrorNote>{crew.error}</ErrorNote>;
  if (!crew.data) {
    return (
      <section className="page narrow">
        <h1 className="page-title">Crew not found</h1>
        <p className="muted">It may have been deleted, or you're not in it. Ask for a new invite link.</p>
        <p>
          <Link to="/crews">Your crews</Link>
        </p>
      </section>
    );
  }

  const c = crew.data;
  const isOwner = c.created_by === userId;
  const memberIds = new Set(c.crew_members.map((m) => m.user_id));
  const playingNow = live.filter((ch) => memberIds.has(ch.user_id) && isLive(ch, now));
  const courtName = (courtId: string) => courts.find((ct) => ct.id === courtId)?.name ?? 'a court';
  const courtSlug = (courtId: string) => courts.find((ct) => ct.id === courtId)?.slug;
  const members = [...c.crew_members].sort((a, b) =>
    a.role === b.role ? a.joined_at.localeCompare(b.joined_at) : a.role === 'owner' ? -1 : 1,
  );

  async function act(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Try again.');
      setBusy(false);
    }
  }

  return (
    <article className="page narrow">
      <p className="crumb">
        <Link to="/crews">Your crews</Link>
      </p>
      <CrewPicture path={c.avatar_url} name={c.name}/><h1 className="page-title">{c.name}</h1>{c.description&&<p>{c.description}</p>}
      <p className="court-meta">
        {[c.schedule, c.courts?.name].filter(Boolean).join(' at ') || 'No regular time set'}
      </p>

      <section className="subsection">
        <h2>Members ({members.length})</h2>
        <ul className="players card-list">
          {members.map((m) => (
            <PlayerRow
              key={m.user_id}
              userId={m.user_id}
              profile={m.profiles}
              you={m.user_id === userId}
              detail={m.role === 'owner' ? <span className="muted">Started the crew</span> : undefined}
            />
          ))}
        </ul>
      </section>

      <InvitePanel crewName={c.name} code={c.invite_code} fresh={params.get('new') === '1'} />

      <CrewRuns key={c.id} crewId={c.id} leader={isOwner}/>{isOwner&&<CrewSettings crew={c} reload={crew.reload}/>}<Chat key={`${userId}:${c.id}`} crewId={c.id} leader={isOwner}/><section className="subsection">
        <h2>Playing now</h2>
        {playingNow.length === 0 ? (
          <p className="muted">Nobody from the crew is checked in.</p>
        ) : (
          <ul className="players card-list">
            {playingNow.map((ch) => {
              const slug = courtSlug(ch.court_id);
              return (
                <PlayerRow
                  key={ch.id}
                  userId={ch.user_id}
                  profile={ch.profiles}
                  you={ch.user_id === userId}
                  detail={
                    <>
                      <span className="live-dot" aria-hidden="true" />{' '}
                      {slug ? <Link to={`/court/${slug}`}>{courtName(ch.court_id)}</Link> : courtName(ch.court_id)}
                      <span className="muted">, {timeLeft(ch.expires_at, now)}</span>
                    </>
                  }
                />
              );
            })}
          </ul>
        )}
      </section>

      <section className="subsection danger-zone">
        {error && <ErrorNote>{error}</ErrorNote>}
        {isOwner ? (
          <button
            className="btn btn-danger"
            disabled={busy}
            onClick={() => {
              if (!window.confirm(`Delete ${c.name}? Everyone in it loses the crew.`)) return;
              void act(async () => {
                await deleteCrew(c.id);
                navigate('/crews');
              });
            }}
          >
            Delete crew
          </button>
        ) : (
          <button
            className="btn btn-quiet"
            disabled={busy}
            onClick={() => {
              if (!window.confirm(`Leave ${c.name}?`)) return;
              void act(async () => {
                await leaveCrew(c.id, userId!);
                navigate('/crews');
              });
            }}
          >
            Leave crew
          </button>
        )}
      </section>
    </article>
  );
}

function InvitePanel({ crewName, code, fresh }: { crewName: string; code: string; fresh: boolean }) {
  const url = inviteUrl(window.location.origin, code);
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
    <div className={fresh ? 'panel invite fresh' : 'panel invite'}>
      <h2>{fresh ? 'Crew created. Now invite your people.' : 'Invite people'}</h2>
      <p className="muted">Anyone with this link can join the crew.</p>
      <p className="invite-url">{url}</p>
      <div className="form-actions">
        <a className="btn btn-primary" href={smsHref(crewName, url)}>
          Text the invite
        </a>
        <button className="btn btn-quiet" onClick={copy}>
          {copied ? 'Link copied' : 'Copy link'}
        </button>
        {canShare && (
          <button
            className="btn btn-quiet"
            onClick={() =>
              navigator.share({ title: crewName, text: `Run with ${crewName} on Runback`, url }).catch(() => undefined)
            }
          >
            Share
          </button>
        )}
      </div>
    </div>
  );
}
