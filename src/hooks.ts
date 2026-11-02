import { useCallback, useEffect, useRef, useState } from 'react';

/** Current time that ticks every `ms` so countdowns and open/closed labels stay fresh. */
export function useNow(ms = 30000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return now;
}

type Loadable<T> = {
  data: T | undefined;
  error: string | null;
  loading: boolean;
  reload: () => Promise<void>;
};

/**
 * Loads data and keeps it fresh: reloads every `refreshMs` (if set) and when the tab comes back into view.
 * Keeps showing the last good data while reloading so the screen doesn't flicker.
 */
export function useLoad<T>(loader: () => Promise<T>, deps: unknown[], refreshMs?: number): Loadable<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const latest = useRef(0);

  // Re-create the loader only when `deps` change (same idea as useEffect's dependency list).
  const load = useCallback(loader, deps);

  const reload = useCallback(async () => {
    const ticket = ++latest.current;
    try {
      const result = await load();
      if (ticket === latest.current) {
        setData(result);
        setError(null);
      }
    } catch (err) {
      if (ticket === latest.current) setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      if (ticket === latest.current) setLoading(false);
    }
  }, [load]);

  useEffect(() => {
    setLoading(true);
    void reload();
  }, [reload]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void reload();
    };
    document.addEventListener('visibilitychange', onVisible);
    const id = refreshMs ? window.setInterval(() => void reload(), refreshMs) : undefined;
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      if (id) window.clearInterval(id);
    };
  }, [reload, refreshMs]);

  return { data, error, loading, reload };
}
