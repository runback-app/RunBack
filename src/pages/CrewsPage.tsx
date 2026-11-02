import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { usePlay } from '../data';
import { useLoad } from '../hooks';
import { createCrew, fetchMyCrews } from '../lib/api';
import { parseInviteCode } from '../lib/invite';
import { ErrorNote, Loading } from '../components';

export function CrewsPage() {
  const { userId, ready } = useAuth();

  if (ready && !userId) {
    return (
      <section className="page narrow">
        <h1 className="page-title">Crews</h1>
        <p>A crew is a group that runs together on a regular day. Start one, then text the invite link to your people.</p>
        <p>
          <Link className="btn btn-primary" to="/login?mode=signup&next=/crews">
            Create your account
          </Link>
        </p>
        <p className="muted">
          Already have one? <Link to="/login?next=/crews">Sign in</Link>
        </p>
      </section>
    );
  }

  return <MyCrews />;
}

function MyCrews() {
  const crews = useLoad(fetchMyCrews, []);
  const [creating, setCreating] = useState(false);

  return (
    <section className="page narrow">
      <div className="section-head">
        <h1 className="page-title">Your crews</h1>
        {!creating && (
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            Start a crew
          </button>
        )}
      </div>

      {creating && <NewCrewForm onCancel={() => setCreating(false)} />}

      {crews.loading && !crews.data && <Loading label="Loading crews" />}
      {crews.error && <ErrorNote>{crews.error}</ErrorNote>}

      {crews.data && crews.data.length === 0 && !creating && (
        <div className="empty">
          <p>You're not in a crew yet.</p>
          <p className="muted">Start one for your regular run, or open an invite link a friend sent you.</p>
        </div>
      )}

      {crews.data && crews.data.length > 0 && (
        <ul className="crew-list">
          {crews.data.map((crew) => {
            const members = crew.crew_members[0]?.count ?? 0;
            return (
              <li key={crew.id}>
                <Link to={`/crew/${crew.id}`} className="crew-link">
                  <span className="crew-name">{crew.name}</span>
                  <span className="crew-meta">
                    {[crew.schedule, crew.courts?.name, members === 1 ? '1 player' : `${members} players`]
                      .filter(Boolean)
                      .join(', ')}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <JoinByLink />
    </section>
  );
}

function NewCrewForm({ onCancel }: { onCancel: () => void }) {
  const { courts } = usePlay();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [courtId, setCourtId] = useState('');
  const [schedule, setSchedule] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) {
      setError('Give your crew a name with at least 2 characters.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const crew = await createCrew(name, courtId || null, schedule);
      navigate(`/crew/${crew.id}?new=1`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Try again.');
      setBusy(false);
    }
  }

  return (
    <form className="panel form" onSubmit={submit}>
      <h2>Start a crew</h2>
      <label className="field">
        <span>Crew name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Tuesday Night Run" required />
      </label>
      <label className="field">
        <span>Home court</span>
        <select value={courtId} onChange={(e) => setCourtId(e.target.value)}>
          <option value="">No home court</option>
          {courts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>When you run</span>
        <input
          value={schedule}
          onChange={(e) => setSchedule(e.target.value)}
          maxLength={80}
          placeholder="Tue and Thu, 6 PM"
        />
      </label>
      {error && <ErrorNote>{error}</ErrorNote>}
      <div className="form-actions">
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? 'Creating…' : 'Create crew'}
        </button>
        <button className="btn btn-quiet" type="button" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function JoinByLink() {
  const navigate = useNavigate();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="join-by-link"
      onSubmit={(e) => {
        e.preventDefault();
        const code = parseInviteCode(value);
        if (!code) {
          setError("That doesn't look like a Runback invite link.");
          return;
        }
        navigate(`/join/${code}`);
      }}
    >
      <label className="field">
        <span>Got an invite link? Paste it here</span>
        <div className="inline-field">
          <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="runback…/join/…" />
          <button className="btn btn-quiet" type="submit">
            Open
          </button>
        </div>
      </label>
      {error && <ErrorNote>{error}</ErrorNote>}
    </form>
  );
}
