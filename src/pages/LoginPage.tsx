import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth';
import { supabase } from '../lib/supabase';
import { ErrorNote } from '../components';
import { resetRequestError } from '../lib/accountRecovery';

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
  const [showPassword,setShowPassword]=useState(false);
  const [resetSent,setResetSent]=useState(false);
  const [confirmPassword,setConfirmPassword]=useState('');
  const [resetWait, setResetWait] = useState(0);

  useEffect(() => {
    if (resetWait <= 0) return;
    const timer = window.setTimeout(() => setResetWait(resetWait - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [resetWait]);

  useEffect(() => {
    if (userId) navigate(next, { replace: true });
  }, [userId, next, navigate]);

  function switchMode(to: 'signin' | 'signup') {
    const updated = new URLSearchParams(params);
    if (to === 'signup') updated.set('mode', 'signup');
    else updated.delete('mode');
    setParams(updated, { replace: true });
    setError(null);
    setResetSent(false);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (mode === 'signup' && name.trim().length === 0) {
      setError('Add the name people know you by.');
      return;
    }
    if(mode==='signup'&&password!==confirmPassword){setError('Passwords do not match.');return;}
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
            type={showPassword?"text":"password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            minLength={6}
            required
          />
          <button className="link-button" type="button" aria-pressed={showPassword} onClick={()=>setShowPassword(!showPassword)}>{showPassword?'Hide password':'Show password'}</button>
          {mode === 'signup' && <small className="muted">At least 6 characters.</small>}
        </label>
        {mode==='signup'&&<label className="field"><span>Confirm password</span><input type={showPassword?'text':'password'} value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} autoComplete="new-password" required minLength={6}/></label>}
        {error && <ErrorNote>{error}</ErrorNote>}
        {mode==='signin'&&<div className="recovery-links"><button className="link-button" type="button" disabled={busy || resetWait > 0} onClick={async()=>{if(!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())){setError('Enter a valid email first, then tap Forgot password.');return;}setBusy(true);setError(null);setResetSent(false);try{const {error}=await supabase.auth.resetPasswordForEmail(email.trim(),{redirectTo:window.location.origin+'/reset-password'});if(error)throw error;setResetSent(true);setResetWait(60);}catch(e){setError(resetRequestError(e instanceof Error?e.message:''));}finally{setBusy(false);}}}>{resetWait > 0 ? `Request another link in ${resetWait}s` : 'Forgot password?'}</button><Link to="/forgot-email">Forgot email?</Link></div>}
        {resetSent&&<p role="status" className="ok">If an account exists for that email, check its inbox and spam folder for a reset link. Open the newest link. No email? <Link to="/forgot-email">Get recovery help</Link>.</p>}
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
