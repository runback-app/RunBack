import { useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from './auth';
import { usePlay } from './data';
import { courtStatus, type CourtStatus } from './lib/hours';
import { avatarColor, initials, playerSummary } from './lib/profile';
import { CHECKIN_OPTIONS, DEFAULT_CHECKIN_MINUTES, timeLeft } from './lib/time';
import type { Court, PlayerBrief } from './lib/types';
import { useNow } from './hooks';

export function StatusPill({ status }: { status: CourtStatus }) {
  return <span className={`pill pill-${status.tone}`}>{status.label}</span>;
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p className="error" role="alert">
      {children}
    </p>
  );
}

export function Loading({ label = 'Loading' }: { label?: string }) {
  return (
    <p className="loading" aria-live="polite">
      {label}…
    </p>
  );
}

/** Photo if the player has one, otherwise their initials on a color. */
export function Avatar({
  name,
  url,
  size = 40,
  seed,
}: {
  name: string | null | undefined;
  url?: string | null;
  size?: number;
  seed?: string;
}) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.38) };
  if (url) {
    return <img className="avatar" src={url} alt="" width={size} height={size} style={style} loading="lazy" />;
  }
  return (
    <span className="avatar avatar-initials" style={{ ...style, background: avatarColor(seed ?? name ?? '') }} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

/** Overlapping faces of who's at a court. */
export function AvatarStack({ people, max = 5 }: { people: { id: string; profile: PlayerBrief | null }[]; max?: number }) {
  if (people.length === 0) return null;
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <span className="stack" aria-label={people.map((p) => p.profile?.display_name ?? 'Player').join(', ')}>
      {shown.map((p) => (
        <Avatar key={p.id} name={p.profile?.display_name} url={p.profile?.avatar_url} size={30} seed={p.id} />
      ))}
      {extra > 0 && <span className="stack-more">+{extra}</span>}
    </span>
  );
}

/** One player in a list: face, name, and their position/height/level. */
export function PlayerRow({
  userId,
  profile,
  you,
  detail,
}: {
  userId: string;
  profile: PlayerBrief | null;
  you?: boolean;
  detail?: ReactNode;
}) {
  const summary = profile ? playerSummary(profile) : '';
  return (
    <li className="player-row">
      <Link to={`/player/${userId}`} className="player-link">
        <Avatar name={profile?.display_name} url={profile?.avatar_url} size={44} seed={userId} />
        <span className="player-text">
          <span className="player-name">
            {profile?.display_name ?? 'Player'}
            {you && <span className="you"> (you)</span>}
          </span>
          {summary && <span className="player-sub">{summary}</span>}
        </span>
      </Link>
      {detail && <span className="player-detail">{detail}</span>}
    </li>
  );
}

/** Star a court to keep it at the top and get alerts for it. */
export function FavoriteButton({ court }: { court: Court }) {
  const { userId } = useAuth();
  const { isFavorite, setFavorite } = usePlay();
  const [busy, setBusy] = useState(false);
  if (!userId) return null;
  const on = isFavorite(court.id);
  return (
    <button
      className={on ? 'star on' : 'star'}
      aria-pressed={on}
      aria-label={on ? `Remove ${court.name} from your courts` : `Add ${court.name} to your courts`}
      title={on ? 'In your courts' : 'Add to your courts'}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await setFavorite(court.id, !on);
        } finally {
          setBusy(false);
        }
      }}
    >
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />
      </svg>
    </button>
  );
}

/** The banner shown everywhere while you're checked in. */
export function MyStatusBar() {
  const { myCheckin, myCourt, endCheckin } = usePlay();
  const now = useNow(15000);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!myCheckin || !myCourt) return null;

  return (
    <div className="mybar" role="status">
      <div className="mybar-text">
        <span className="live-dot" aria-hidden="true" />
        <span>
          You're at <Link to={`/court/${myCourt.slug}`}>{myCourt.name}</Link>
          <span className="mybar-time">{timeLeft(myCheckin.expires_at, now)}</span>
        </span>
      </div>
      <button
        className="btn btn-quiet btn-small"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await endCheckin();
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Try again.');
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? 'Leaving…' : 'Leave court'}
      </button>
      {error && <ErrorNote>{error}</ErrorNote>}
    </div>
  );
}

/**
 * Check in / move here / leave controls for one court.
 * `compact` is the one-tap "I'm here" button at the top of a court page (default length).
 */
export function CheckInControl({ court, compact = false }: { court: Court; compact?: boolean }) {
  const { userId } = useAuth();
  const { myCheckin, startCheckin, endCheckin } = usePlay();
  const location = useLocation();
  const now = useNow(15000);
  const [minutes, setMinutes] = useState(DEFAULT_CHECKIN_MINUTES);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!userId) {
    const to = `/login?next=${encodeURIComponent(location.pathname)}`;
    return compact ? (
      <Link className="btn btn-primary btn-checkin" to={to}>
        I'm here
      </Link>
    ) : (
      <div className="checkin-signin">
        <Link className="btn btn-primary" to={to}>
          Sign in to check in
        </Link>
      </div>
    );
  }

  const here = myCheckin?.court_id === court.id;
  const elsewhere = !!myCheckin && !here;
  const status = courtStatus(court.hours, now);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  }

  function go(mins: number) {
    if(court.closure_note&&(!court.closure_until||new Date(court.closure_until)>now)){setError(`Temporary closure: ${court.closure_note}`);return;}
    if (!status.open && !window.confirm(`${court.name} looks closed right now. Check in anyway?`)) return;
    void run(() => startCheckin(court.id, mins));
  }

  const optionLabel = (mins: number) => CHECKIN_OPTIONS.find((o) => o.minutes === mins)?.label ?? `${mins} min`;

  if (compact) {
    if (here) {
      return (
        <div className="checkin-compact">
          <span className="here-tag">You're here · {timeLeft(myCheckin!.expires_at, now)}</span>
          <button className="link-button quiet-link" disabled={busy} onClick={() => void run(endCheckin)}>
            {busy ? 'Leaving…' : 'Check out'}
          </button>
          {error && <ErrorNote>{error}</ErrorNote>}
        </div>
      );
    }
    return (
      <div className="checkin-compact">
        <button className="btn btn-primary btn-checkin" disabled={busy} onClick={() => go(DEFAULT_CHECKIN_MINUTES)}>
          {busy ? 'Checking in…' : elsewhere ? 'Move here' : "I'm here"}
        </button>
        {error && <ErrorNote>{error}</ErrorNote>}
      </div>
    );
  }

  return (
    <div className="checkin">
      {here && (
        <p className="checkin-here">
          <span className="live-dot" aria-hidden="true" /> You're checked in here, {timeLeft(myCheckin!.expires_at, now)}.
        </p>
      )}
      <fieldset className="segmented">
        <legend>{here ? 'Still here? Reset your time' : 'How long are you playing?'}</legend>
        {CHECKIN_OPTIONS.map((option) => (
          <label key={option.minutes} className={minutes === option.minutes ? 'seg on' : 'seg'}>
            <input
              type="radio"
              name={`len-${court.id}`}
              value={option.minutes}
              checked={minutes === option.minutes}
              onChange={() => setMinutes(option.minutes)}
            />
            {option.label}
          </label>
        ))}
      </fieldset>
      <div className="checkin-actions">
        <button className="btn btn-primary" disabled={busy} onClick={() => go(minutes)}>
          {busy
            ? 'Saving…'
            : here
              ? `Reset to ${optionLabel(minutes)}`
              : elsewhere
                ? `Move here for ${optionLabel(minutes)}`
                : `Check in for ${optionLabel(minutes)}`}
        </button>
        {here && (
          <button className="btn btn-quiet" disabled={busy} onClick={() => void run(endCheckin)}>
            Leave court
          </button>
        )}
      </div>
      {error && <ErrorNote>{error}</ErrorNote>}
    </div>
  );
}

/* ---------- Icons for the tab bar ---------- */
export function CourtIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M12 4v16M3 9h3v6H3M21 9h-3v6h3" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function CrewIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 19c.6-3.4 3-5.2 6-5.2s5.4 1.8 6 5.2" />
      <circle cx="17" cy="9" r="2.4" />
      <path d="M16.5 13.9c2.4.2 4 1.7 4.5 4.6" />
    </svg>
  );
}

export function FriendsIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="10" cy="8" r="3.4" />
      <path d="M3.5 20c.7-3.8 3.4-5.9 6.5-5.9 1.6 0 3 .5 4.2 1.4" />
      <path d="M18 13.5v6M15 16.5h6" />
    </svg>
  );
}

export function YouIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="8" r="3.6" />
      <path d="M4.5 20c.8-4 3.7-6.2 7.5-6.2s6.7 2.2 7.5 6.2" />
    </svg>
  );
}
