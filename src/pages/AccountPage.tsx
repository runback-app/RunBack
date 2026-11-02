import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { updateDisplayName } from '../lib/api';
import { ErrorNote } from '../components';

export function AccountPage() {
  const { userId, ready, profile, session, refreshProfile, signOut } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (profile) setName(profile.display_name);
  }, [profile]);

  if (ready && !userId) {
    return (
      <section className="section narrow">
        <h1 className="page-title">You're signed out</h1>
        <p>
          <Link to="/login">Sign in</Link>
        </p>
      </section>
    );
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!userId) return;
    if (name.trim().length === 0) {
      setError('Your name can’t be empty.');
      return;
    }
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await updateDisplayName(userId, name);
      await refreshProfile();
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="section narrow">
      <h1 className="page-title">Your profile</h1>
      <form className="panel form" onSubmit={save}>
        <label className="field">
          <span>Name other players see</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
        </label>
        <p className="muted">Signed in as {session?.user.email}</p>
        {error && <ErrorNote>{error}</ErrorNote>}
        {saved && <p className="ok">Name saved.</p>}
        <div className="form-actions">
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save name'}
          </button>
          <button
            className="btn btn-quiet"
            type="button"
            onClick={async () => {
              await signOut();
              navigate('/');
            }}
          >
            Sign out
          </button>
        </div>
      </form>
    </section>
  );
}
