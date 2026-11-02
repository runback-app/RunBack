import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth';
import { useLoad } from '../hooks';
import { fetchCrewPreview, joinCrew } from '../lib/api';
import { parseInviteCode } from '../lib/invite';
import { ErrorNote, Loading } from '../components';

export function JoinPage() {
  const { code: raw = '' } = useParams();
  const code = parseInviteCode(raw);
  const { userId } = useAuth();
  const navigate = useNavigate();
  const preview = useLoad(() => (code ? fetchCrewPreview(code) : Promise.resolve(null)), [code]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (preview.loading && !preview.data) return <Loading label="Opening invite" />;
  if (preview.error) return <ErrorNote>{preview.error}</ErrorNote>;

  const crew = preview.data;
  if (!code || !crew) {
    return (
      <section className="page narrow">
        <h1 className="page-title">This invite doesn't work</h1>
        <p className="muted">The crew may have been deleted. Ask whoever sent it for a new link.</p>
        <p>
          <Link to="/">See courts</Link>
        </p>
      </section>
    );
  }

  const next = `/join/${code}`;

  return (
    <section className="page narrow">
      <div className="panel join-card">
        <p className="muted">You're invited to run with</p>
        <h1 className="page-title">{crew.name}</h1>
        <p className="court-meta">
          {[crew.schedule, crew.court_name].filter(Boolean).join(' at ') || 'No regular time set yet'}
        </p>
        <p>{crew.members === 1 ? '1 player so far' : `${crew.members} players so far`}</p>

        {userId ? (
          <>
            <button
              className="btn btn-primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  const crewId = await joinCrew(code);
                  navigate(`/crew/${crewId}`);
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Try again.');
                  setBusy(false);
                }
              }}
            >
              {busy ? 'Joining…' : `Join ${crew.name}`}
            </button>
            {error && <ErrorNote>{error}</ErrorNote>}
          </>
        ) : (
          <div className="form-actions">
            <Link className="btn btn-primary" to={`/login?mode=signup&next=${encodeURIComponent(next)}`}>
              Create an account to join
            </Link>
            <Link className="btn btn-quiet" to={`/login?next=${encodeURIComponent(next)}`}>
              Sign in
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
