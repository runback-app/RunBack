import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { usePlay } from '../data';
import { useLoad } from '../hooks';
import { createCrew, fetchMyCrews } from '../lib/api';
import { parseInviteCode } from '../lib/invite';
import { CrewIcon, ErrorNote, Loading, SectionHero } from '../components';

export function CrewsPage() {
  const { userId, ready } = useAuth();

  if (ready && !userId) {
    return (
      <section className="page social-page">
        <SectionHero label="Run with your people" title="Crews" description="Get your regulars together, plan the next run, and share an invite."
          action={<><Link className="btn btn-primary" to="/login?mode=signup&next=/crews">Create your account</Link>
            <Link className="btn btn-quiet" to="/login?next=/crews">Sign in</Link></>} />
      </section>
    );
  }

  return <MyCrews />;
}

function MyCrews() {
  const crews = useLoad(fetchMyCrews, []);
  const [creating, setCreating] = useState(false);

  return (
    <section className="page social-page">
      <SectionHero label="Run with your people" title="Your crews"
        description="See your groups and get the next run on the calendar."
        action={!creating && (
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            Start a crew
          </button>
        )} />
      {creating && <NewCrewForm onCancel={() => setCreating(false)} />}

      <div className="social-layout">
        <section className="social-stack" aria-labelledby="my-crews-heading">
          <h2 id="my-crews-heading" className="display-title">My crews</h2>
          {crews.loading && !crews.data && <Loading label="Loading crews" />}
          {crews.error && <ErrorNote>{crews.error}</ErrorNote>}

          {crews.data && crews.data.length === 0 && !creating && (
            <div className="panel social-panel">
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
                      <span className="social-symbol" aria-hidden="true"><CrewIcon /></span>
                      <span className="crew-card-copy">
                        <span className="crew-name">{crew.name}</span>
                        <span className="crew-meta">
                          {[crew.courts?.name, crew.schedule].filter(Boolean).join(' · ') || 'No regular court or time set'}
                        </span>
                      </span>
                      <span className="crew-card-count"><strong>{members}</strong> {members === 1 ? 'player' : 'players'}</span>
                      <span className="social-arrow" aria-hidden="true">›</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <JoinByLink />
      </div>
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
      className="panel social-panel join-by-link"
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
      <h2>Join a crew</h2>
      <p className="muted">Open an invite link someone sent you.</p>
      <label className="field">
        <span>Invite link</span>
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
