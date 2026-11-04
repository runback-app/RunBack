import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../auth';
import { sendFeedback } from '../lib/api';
import { ErrorNote } from '../components';

export function PrivacyPage() {
  const location = useLocation();
  useEffect(() => {
    if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: 'smooth' });
  }, [location.hash]);

  return (
    <article className="page narrow prose">
      <h1 className="page-title">Privacy</h1>
      <p className="muted">Last updated November 3, 2026</p>
      <p>
        Runback helps people find pickup runs in Tucson. Here's what we collect, who can see it, and how to delete it.
        The short version: we only keep what the app needs, and we never sell your info or use it for ads.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Your account:</strong> your email and password. Passwords are stored scrambled, so nobody can read
          them, including us.
        </li>
        <li>
          <strong>Your profile:</strong> your name, plus anything you choose to add: photo, position, height, level,
          home court, and bio.
        </li>
        <li>
          <strong>Check-ins:</strong> which court you checked in at and when.
        </li>
        <li>
          <strong>Crews and runs:</strong> crews you start or join, planned runs, RSVPs, reminders, crew photos, and messages you post.
        </li>
        <li>
          <strong>Court chat:</strong> messages you post in a court's chat, and messages you report.
        </li>
        <li>
          <strong>Alerts:</strong> your starred courts and alert settings. If you turn on alerts, we store a device
          address so we can send them.
        </li>
        <li>
          <strong>Messages you send us</strong> through the form below.
        </li>
        <li><strong>Account recovery requests:</strong> the player name, contact email, and crew or court details you provide when you ask for help signing in. Only the Runback team can read these requests.</li>
        <li>
          <strong>Visits:</strong> anonymous page-view counts so we know which pages get used. No cookies and no ad
          tracking.
        </li>
      </ul>

      <h2>Who can see what</h2>
      <ul>
        <li>
          <strong>Anyone:</strong> courts, hours, how many people are checked in, and how many teams are waiting. No names.
        </li>
        <li>
          <strong>Signed-in players:</strong> your name, photo, profile, the court you're checked in at right now, which
          Got next team you're on (or that you're a free agent), and anything you post in a court chat. Who reported a
          message is never shown.
        </li>
        <li>
          <strong>Your crews:</strong> who's in the crew and its invite link. Anyone with the link can join, so only
          share it with people you want in. Current crew members can see crew/run chats, RSVPs, and crew photos. Crew leaders can remove messages and members.
        </li>
      </ul>

      <h2>How long we keep it</h2>
      <ul>
        <li>Check-ins leave the app when your time runs out. The history is deleted after 30 days.</li>
        <li>Got next teams leave the line after 1 hour and are deleted after a day.</li>
        <li>Court chat messages are deleted after 24 hours. A message reported by 3 players is hidden right away.</li>
        <li>Chat messages and run details stay until removed or the crew is deleted. Your messages and RSVPs are deleted when you delete your account.</li>
        <li>Account recovery requests are deleted after 30 days. A request does not automatically change an account; we verify ownership before helping restore access.</li>
      </ul>

      <h2>Deleting your account</h2>
      <p>
        Go to <Link to="/me#delete">your profile</Link> and tap Delete account. That removes your profile, photo,
        check-ins, starred courts, alert devices, crew memberships, and any crews you started. Messages you sent us are
        kept without your name.
      </p>

      <h2>Services we use</h2>
      <p>
        Supabase stores the data. Resend delivers account emails. Vercel runs the website and counts page views. Maps come from OpenStreetMap, the
        lettering from Google Fonts, and alerts are delivered by Apple, Google, or Mozilla depending on your device.
        These services see basic technical info, like your IP address, when your browser loads from them.
      </p>

      <h2>Age</h2>
      <p>You need to be at least 13 to use Runback.</p>

      <h2 id="contact">Questions or requests</h2>
      <FeedbackForm />
    </article>
  );
}

export function FeedbackForm() {
  const { userId } = useAuth();
  const location = useLocation();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!userId) {
    return (
      <p>
        <Link to={`/login?next=${encodeURIComponent(location.pathname + '#contact')}`}>Sign in</Link> to send us a
        message.
      </p>
    );
  }

  if (sent) {
    return <p className="ok">Got it, thanks. We read every message.</p>;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!userId) return;
    if (!message.trim()) {
      setError('Write a message first.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await sendFeedback(userId, message, location.pathname);
      setSent(true);
      setMessage('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form feedback" onSubmit={submit}>
      <label className="field">
        <span>Send us a message</span>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={4}
          maxLength={2000}
          placeholder="An idea, a bug, a court we should add, or a question about your data"
        />
      </label>
      {error && <ErrorNote>{error}</ErrorNote>}
      <div className="form-actions">
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? 'Sending…' : 'Send message'}
        </button>
      </div>
    </form>
  );
}
