import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth';
import { ErrorNote } from '../components';

/** Only allow redirects back into this site. */
function safeNext(value: string | null): string {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '/';
}

export function LoginPage() {
  const [params, setParams] = useSearchParams();
  const mode = params.get('mode') === 'signup' ? 'signup' : 'signin';
  const next = safeNext(params.get('next'));
  const { userId, signIn, signUp } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkEmail, setCheckEmail] = useState(false);

  useEffect(() => {
    if (userId) navigate(next, { replace: true });
  }, [userId, next, navigate]);

  function switchMode(to: 'signin' | 'signup') {
    const updated = new URLSearchParams(params);
    if (to === 'signup') updated.set('mode', 'signup');
    else updated.delete('mode');
    setParams(updated, { replace: true });
    setError(null);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (mode === 'signup' && name.trim().length === 0) {
      setError('Add the name people know you by.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'signup') {
        const { needsEmailConfirm } = await signUp(name, email, password);
        if (needsEmailConfirm) setCheckEmail(true);
      } else {
        await signIn(email, password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  }

  if (checkEmail) {
    return (
      <section className="page narrow">
        <h1 className="page-title">Check your email</h1>
        <p>We sent a link to {email}. Open it to finish making your account.</p>
      </section>
    );
  }

  return (
    <section className="page narrow">
      <h1 className="page-title">{mode === 'signup' ? 'Create your account' : 'Sign in'}</h1>
      <form className="panel form" onSubmit={submit}>
        {mode === 'signup' && (
          <label className="field">
            <span>Your name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="nickname"
              maxLength={40}
              placeholder="What people call you on the court"
            />
          </label>
        )}
        <label className="field">
          <span>Email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            minLength={6}
            required
          />
          {mode === 'signup' && <small className="muted">At least 6 characters.</small>}
        </label>
        {error && <ErrorNote>{error}</ErrorNote>}
        <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
          {busy ? 'One sec…' : mode === 'signup' ? 'Create account' : 'Sign in'}
        </button>
        {mode === 'signup' && (
          <p className="fine">
            You need to be 13 or older. See <Link to="/privacy">how we handle your info</Link>.
          </p>
        )}
      </form>
      <p className="switch">
        {mode === 'signup' ? (
          <>
            Already have an account?{' '}
            <button className="link-button" onClick={() => switchMode('signin')}>
              Sign in
            </button>
          </>
        ) : (
          <>
            New to Runback?{' '}
            <button className="link-button" onClick={() => switchMode('signup')}>
              Create an account
            </button>
          </>
        )}
      </p>
      <p className="muted">
        <Link to="/">Back to courts</Link>
      </p>
    </section>
  );
}
