import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { usePlay } from '../data';
import { currentSubscription, showTestAlert, turnOffAlerts, turnOnAlerts } from '../alerts';
import { deleteMyAccount, updateProfile, uploadAvatar } from '../lib/api';
import { squarePhoto } from '../lib/image';
import { POSITIONS, SKILLS } from '../lib/profile';
import { currentAlertSupport } from '../lib/push';
import { Avatar, ErrorNote } from '../components';

export function ProfilePage() {
  const { userId, ready, profile } = useAuth();

  if (ready && !userId) {
    return (
      <section className="page narrow">
        <h1 className="page-title">You're signed out</h1>
        <p>
          <Link className="btn btn-primary" to="/login">
            Sign in
          </Link>
        </p>
      </section>
    );
  }
  if (!profile) return null;

  return (
    <div className="page narrow">
      <div className="title-row">
        <h1 className="page-title">Your profile</h1>
        <Link className="text-link" to={`/player/${profile.id}`}>
          See your player card
        </Link>
      </div>
      <PhotoPicker />
      <ProfileForm />
      <AlertSettings />
      <SignOut />
      <DeleteAccount />
    </div>
  );
}

function DeleteAccount() {
  const { userId, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const section = useRef<HTMLElement>(null);

  useEffect(() => {
    if (location.hash === '#delete') {
      setOpen(true);
      section.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [location.hash]);

  if (!userId) return null;

  async function remove() {
    if (!userId) return;
    setBusy(true);
    setError(null);
    try {
      await turnOffAlerts().catch(() => undefined);
      await deleteMyAccount(userId);
      await signOut();
      navigate('/?deleted=1', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Try again.');
      setBusy(false);
    }
  }

  return (
    <section className="danger-panel" id="delete" ref={section}>
      {!open ? (
        <button className="link-button danger-link" onClick={() => setOpen(true)}>
          Delete account
        </button>
      ) : (
        <div className="panel danger-box">
          <h2>Delete your account?</h2>
          <p>
            This removes your profile, photo, check-ins, starred courts, alerts, and crew memberships. Crews you started
            are deleted for everyone in them. This can't be undone.
          </p>
          <label className="field">
            <span>Type DELETE to confirm</span>
            <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          </label>
          {error && <ErrorNote>{error}</ErrorNote>}
          <div className="form-actions">
            <button className="btn btn-danger" disabled={busy || typed.trim().toUpperCase() !== 'DELETE'} onClick={remove}>
              {busy ? 'Deleting…' : 'Delete my account'}
            </button>
            <button
              className="btn btn-quiet"
              disabled={busy}
              onClick={() => {
                setOpen(false);
                setTyped('');
              }}
            >
              Keep my account
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function PhotoPicker() {
  const { userId, profile, refreshProfile } = useAuth();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!profile || !userId) return null;

  async function pick(file: File | undefined) {
    if (!file || !userId) return;
    setBusy(true);
    setError(null);
    try {
      const photo = await squarePhoto(file);
      const url = await uploadAvatar(userId, photo);
      await updateProfile(userId, { avatar_url: url });
      await refreshProfile();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Try another photo.');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <div className="photo-row">
      <Avatar name={profile.display_name} url={profile.avatar_url} size={88} seed={profile.id} />
      <div>
        <button className="btn btn-quiet" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? 'Uploading…' : profile.avatar_url ? 'Change photo' : 'Add a photo'}
        </button>
        <input
          ref={input}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => void pick(e.target.files?.[0])}
          aria-label="Choose a profile photo"
        />
        <p className="fine">Helps people know who to look for at the court.</p>
        {error && <ErrorNote>{error}</ErrorNote>}
      </div>
    </div>
  );
}

function ProfileForm() {
  const { userId, profile, refreshProfile } = useAuth();
  const { courts } = usePlay();
  const [name, setName] = useState('');
  const [position, setPosition] = useState('');
  const [skill, setSkill] = useState('');
  const [feet, setFeet] = useState('');
  const [inches, setInches] = useState('');
  const [homeCourt, setHomeCourt] = useState('');
  const [bio, setBio] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    setName(profile.display_name);
    setPosition(profile.position ?? '');
    setSkill(profile.skill ?? '');
    setFeet(profile.height_in ? String(Math.floor(profile.height_in / 12)) : '');
    setInches(profile.height_in ? String(profile.height_in % 12) : '');
    setHomeCourt(profile.home_court_id ?? '');
    setBio(profile.bio ?? '');
  }, [profile]);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!userId) return;
    if (!name.trim()) {
      setError('Add the name people know you by.');
      return;
    }
    const height = feet ? Number(feet) * 12 + Number(inches || 0) : null;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await updateProfile(userId, {
        display_name: name.trim(),
        position: position || null,
        skill: skill || null,
        height_in: height,
        home_court_id: homeCourt || null,
        bio: bio.trim() || null,
      });
      await refreshProfile();
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel form" onSubmit={save}>
      <label className="field">
        <span>Name other players see</span>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
      </label>

      <fieldset className="choice">
        <legend>Position</legend>
        <div className="chips">
          {POSITIONS.map((p) => (
            <label key={p.value} className={position === p.value ? 'chip on' : 'chip'} title={p.label}>
              <input
                type="radio"
                name="position"
                value={p.value}
                checked={position === p.value}
                onChange={() => setPosition(p.value)}
                onClick={() => position === p.value && setPosition('')}
              />
              {p.value}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="choice">
        <legend>Height</legend>
        <div className="inline-field">
          <select aria-label="Feet" value={feet} onChange={(e) => setFeet(e.target.value)}>
            <option value="">Feet</option>
            {[4, 5, 6, 7].map((f) => (
              <option key={f} value={f}>
                {f} ft
              </option>
            ))}
          </select>
          <select aria-label="Inches" value={inches} onChange={(e) => setInches(e.target.value)} disabled={!feet}>
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i} value={i}>
                {i} in
              </option>
            ))}
          </select>
        </div>
      </fieldset>

      <fieldset className="choice">
        <legend>How you play</legend>
        <div className="chips">
          {SKILLS.map((s) => (
            <label key={s.value} className={skill === s.value ? 'chip on' : 'chip'}>
              <input
                type="radio"
                name="skill"
                value={s.value}
                checked={skill === s.value}
                onChange={() => setSkill(s.value)}
                onClick={() => skill === s.value && setSkill('')}
              />
              {s.label}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="field">
        <span>Home court</span>
        <select value={homeCourt} onChange={(e) => setHomeCourt(e.target.value)}>
          <option value="">None</option>
          {courts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>About you</span>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          maxLength={160}
          rows={3}
          placeholder="Lefty, plays D, always down for a 6 PM run"
        />
        <small className="muted">{160 - bio.length} characters left</small>
      </label>

      {error && <ErrorNote>{error}</ErrorNote>}
      {saved && <p className="ok">Profile saved.</p>}
      <div className="form-actions">
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save profile'}
        </button>
      </div>
    </form>
  );
}

function AlertSettings() {
  const { userId, profile, refreshProfile } = useAuth();
  const { courts, favorites, changeFavorite } = usePlay();
  const location = useLocation();
  const support = currentAlertSupport();
  const [deviceOn, setDeviceOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const section = useRef<HTMLElement>(null);

  useEffect(() => {
    if (location.hash === '#alerts') section.current?.scrollIntoView({ behavior: 'smooth' });
  }, [location.hash]);

  useEffect(() => {
    if (support !== 'ready') return;
    currentSubscription()
      .then((sub) => setDeviceOn(!!sub && Notification.permission === 'granted'))
      .catch(() => setDeviceOn(false));
  }, [support]);

  async function run(action: () => Promise<void>, done?: string) {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      await action();
      if (done) setNote(done);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  }

  if (!profile || !userId) return null;
  const favCourts = favorites
    .map((f) => ({ fav: f, court: courts.find((c) => c.id === f.court_id) }))
    .filter((x) => x.court);

  return (
    <section className="panel" id="alerts" ref={section}>
      <h2>Alerts</h2>

      {support === 'install-first' && (
        <div className="install-guide">
          <p>
            <strong>On iPhone, add Runback to your Home Screen first.</strong> Apple only allows alerts from sites you've
            added.
          </p>
          <ol>
            <li>Tap the Share button at the bottom of Safari.</li>
            <li>Tap Add to Home Screen, then Add.</li>
            <li>Open Runback from your Home Screen and come back to this page.</li>
          </ol>
        </div>
      )}
      {support === 'unsupported' && (
        <p className="muted">This browser can't show alerts. Try Chrome, Edge, Firefox, or Safari on a phone or computer.</p>
      )}
      {support === 'ready' && (
        <div className="device-row">
          <p>
            {deviceOn === null
              ? 'Checking this device…'
              : deviceOn
                ? 'Alerts are on for this device.'
                : 'Alerts are off for this device.'}
          </p>
          <div className="form-actions">
            {deviceOn ? (
              <>
                <button className="btn btn-quiet" disabled={busy} onClick={() => run(showTestAlert, 'Sent a test alert.')}>
                  Send a test
                </button>
                <button
                  className="btn btn-quiet"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await turnOffAlerts();
                      setDeviceOn(false);
                    })
                  }
                >
                  Turn off
                </button>
              </>
            ) : (
              <button
                className="btn btn-primary"
                disabled={busy || deviceOn === null}
                onClick={() =>
                  run(async () => {
                    await turnOnAlerts();
                    setDeviceOn(true);
                  }, 'Alerts are on. You can send yourself a test.')
                }
              >
                {busy ? 'Turning on…' : 'Turn on alerts'}
              </button>
            )}
          </div>
        </div>
      )}

      <h3 className="group-title">Tell me when</h3>
      <label className="switch-row">
        <input
          type="checkbox"
          checked={profile.notify_crew}
          disabled={busy}
          onChange={(e) =>
            run(async () => {
              await updateProfile(userId, { notify_crew: e.target.checked });
              await refreshProfile();
            })
          }
        />
        <span>Someone in my crews checks in</span>
      </label>

      {favCourts.length === 0 ? (
        <p className="fine">
          Star a court on the <Link to="/">courts page</Link> to get an alert when a run starts there.
        </p>
      ) : (
        <ul className="fav-alerts">
          {favCourts.map(({ fav, court }) => (
            <li key={fav.court_id}>
              <label className="switch-row">
                <input
                  type="checkbox"
                  checked={fav.alerts}
                  disabled={busy}
                  onChange={(e) => run(() => changeFavorite(fav.court_id, { alerts: e.target.checked }))}
                />
                <span>
                  {court!.name} has {fav.alert_at}+ players
                </span>
              </label>
              <Link className="text-link" to={`/court/${court!.slug}`}>
                Change
              </Link>
            </li>
          ))}
        </ul>
      )}

      {note && <p className="ok">{note}</p>}
      {error && <ErrorNote>{error}</ErrorNote>}
    </section>
  );
}

function SignOut() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  return (
    <p className="signout">
      <button
        className="btn btn-quiet"
        onClick={async () => {
          // Stop alerts on this device so the next person to use it doesn't get yours.
          await turnOffAlerts().catch(() => undefined);
          await signOut();
          navigate('/');
        }}
      >
        Sign out
      </button>
    </p>
  );
}
