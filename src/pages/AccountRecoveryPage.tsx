import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { ErrorNote, Loading } from '../components';
import { supabase } from '../lib/supabase';
import { validateRecoveryRequest } from '../lib/accountRecovery';

export function AccountRecoveryPage() {
  const { ready, session } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [details, setDetails] = useState('');
  const [website, setWebsite] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const problem = validateRecoveryRequest({ displayName, contactEmail, details });
    if (problem) { setError(problem); return; }
    setError(null);
    setBusy(true);
    try {
      if (!website) {
        const { error: requestError } = await supabase.from('account_recovery_requests').insert({
          display_name: displayName.trim(),
          contact_email: contactEmail.trim().toLowerCase(),
          details: details.trim(),
        });
        if (requestError) throw requestError;
      }
      setSent(true);
      setDisplayName(''); setContactEmail(''); setDetails('');
    } catch {
      setError('Your request could not be saved. Check your connection and try again.');
    } finally { setBusy(false); }
  }

  if (!ready) return <Loading />;
  return (
    <section className="page narrow">
      <h1 className="page-title">Forgot your email?</h1>
      {session?.user.email ? (
        <div className="panel">
          <h2>You're already signed in</h2>
          <p>Your Runback sign-in email is <strong>{session.user.email}</strong>.</p>
          <p className="fine">Save it in your password manager before signing out.</p>
          <Link className="btn btn-primary" to="/me">Back to your profile</Link>
        </div>
      ) : (
        <>
          <p>First, check your browser's saved passwords for Runback, or search your inboxes for “Runback” or “Supabase.”</p>
          <p>If you're signed in on another device, open your profile there to see your sign-in email.</p>
          {sent ? (
            <div className="panel" role="status">
              <h2>Request submitted</h2>
              <p>The Runback team will review your request. We'll need to verify that the account belongs to you before sharing or changing any account information.</p>
              <p className="fine">This does not change your account or send an automatic email. If you've already submitted a request, please wait for the team to review it.</p>
            </div>
          ) : (
            <form className="panel form" onSubmit={submit}>
              <h2>Ask the Runback team for help</h2>
              <p>This is a manual review. Your name and crew details help us investigate, but aren't proof of ownership by themselves.</p>
              <label className="field"><span>Name on your player profile</span><input value={displayName} onChange={e => setDisplayName(e.target.value)} autoComplete="nickname" maxLength={80} required /></label>
              <label className="field"><span>Email you can access now</span><input type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} autoComplete="email" maxLength={254} required /></label>
              <label className="field"><span>Your crew or usual court</span><textarea value={details} onChange={e => setDetails(e.target.value)} rows={4} minLength={10} maxLength={1000} placeholder="Tell us your crew's name or where you usually play. Never send a password or reset code." required /></label>
              <label className="recovery-honeypot" aria-hidden="true">Leave this empty<input value={website} onChange={e => setWebsite(e.target.value)} tabIndex={-1} autoComplete="off" /></label>
              <p className="fine">Only the Runback team can read requests. They are deleted after 30 days. <Link to="/privacy">Privacy</Link></p>
              {error && <ErrorNote>{error}</ErrorNote>}
              <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Submitting…' : 'Request recovery help'}</button>
            </form>
          )}
        </>
      )}
      <p className="switch"><Link to="/login">Back to sign in</Link></p>
    </section>
  );
}
