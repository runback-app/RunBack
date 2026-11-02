import { useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from './auth';
import { usePlay } from './data';
import { courtStatus, type CourtStatus } from './lib/hours';
import { FULL_RUN, runMeter } from './lib/run';
import { CHECKIN_OPTIONS, DEFAULT_CHECKIN_MINUTES, timeLeft } from './lib/time';
import type { Court } from './lib/types';
import { useNow } from './hooks';

/** Ten spots split into two teams of five. Filled spots are players checked in. */
export function RunMeter({ players, size = 'md' }: { players: number; size?: 'md' | 'lg' }) {
  const meter = runMeter(players);
  return (
    <div className={`meter meter-${size}`} role="img" aria-label={`${players} checked in. ${meter.label}.`}>
      <div className="meter-spots" aria-hidden="true">
        {[0, 1].map((team) => (
          <span className="meter-team" key={team}>
            {Array.from({ length: FULL_RUN / 2 }, (_, i) => {
              const index = team * (FULL_RUN / 2) + i;
              return <span key={index} className={index < meter.filled ? 'spot on' : 'spot'} />;
            })}
          </span>
        ))}
        {meter.waiting > 0 && <span className="meter-extra">+{meter.waiting}</span>}
      </div>
      <span className="meter-label">{meter.label}</span>
    </div>
  );
}

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
 * `compact` is the one-tap version used in the court list (always 2 hours).
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
      <Link className="btn btn-quiet" to={to}>
        Check in
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
    if (!status.open && !window.confirm(`${court.name} looks closed right now. Check in anyway?`)) return;
    void run(() => startCheckin(court.id, mins));
  }

  const label = (mins: number) => {
    const option = CHECKIN_OPTIONS.find((o) => o.minutes === mins)?.label ?? `${mins} min`;
    return elsewhere ? `Move here for ${option}` : `Check in for ${option}`;
  };

  if (compact) {
    if (here) {
      return <span className="here-tag">You're here, {timeLeft(myCheckin!.expires_at, now)}</span>;
    }
    return (
      <div className="checkin-compact">
        <button className="btn btn-primary" disabled={busy} onClick={() => go(DEFAULT_CHECKIN_MINUTES)}>
          {busy ? 'Checking in…' : elsewhere ? 'Move here' : 'Check in'}
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
      <fieldset className="segmented" aria-label="How long are you playing?">
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
          {busy ? 'Saving…' : here ? `Reset to ${CHECKIN_OPTIONS.find((o) => o.minutes === minutes)?.label}` : label(minutes)}
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
