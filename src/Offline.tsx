import { useEffect, useState } from 'react';

/** Full-screen note when the phone has no internet. Goes away by itself when it's back. */
export function OfflineScreen() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  if (online) return null;
  return (
    <div className="offline" role="alert">
      <div className="offline-card">
        <h1 className="page-title">No connection</h1>
        <p>Runback needs internet to show who's at the court. It'll come back on its own when you're online.</p>
        <button className="btn btn-primary" onClick={() => window.location.reload()}>
          Try again
        </button>
      </div>
    </div>
  );
}
