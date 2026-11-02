import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { checkIn, checkOut, fetchActivity, fetchCourts, fetchMyCheckin } from './lib/api';
import type { Checkin, Court } from './lib/types';
import { useAuth } from './auth';
import { useLoad } from './hooks';

type PlayState = {
  courts: Court[];
  courtsError: string | null;
  courtsLoading: boolean;
  activity: Record<string, number>;
  myCheckin: Checkin | null;
  myCourt: Court | null;
  refresh: () => Promise<void>;
  startCheckin: (courtId: string, minutes: number) => Promise<void>;
  endCheckin: () => Promise<void>;
};

const PlayContext = createContext<PlayState | null>(null);

export function PlayProvider({ children }: { children: ReactNode }) {
  const { userId } = useAuth();
  const courts = useLoad(fetchCourts, []);
  const activity = useLoad(fetchActivity, [], 30000);
  const mine = useLoad(() => (userId ? fetchMyCheckin(userId) : Promise.resolve(null)), [userId], 60000);

  const reloadActivity = activity.reload;
  const reloadMine = mine.reload;
  const refresh = useCallback(async () => {
    await Promise.all([reloadActivity(), reloadMine()]);
  }, [reloadActivity, reloadMine]);

  const startCheckin = useCallback(
    async (courtId: string, minutes: number) => {
      await checkIn(courtId, minutes);
      await refresh();
    },
    [refresh],
  );

  const endCheckin = useCallback(async () => {
    await checkOut();
    await refresh();
  }, [refresh]);

  const myCheckin = mine.data ?? null;
  const courtList = courts.data ?? [];

  const value = useMemo<PlayState>(
    () => ({
      courts: courtList,
      courtsError: courts.error,
      courtsLoading: courts.loading,
      activity: activity.data ?? {},
      myCheckin,
      myCourt: myCheckin ? courtList.find((c) => c.id === myCheckin.court_id) ?? null : null,
      refresh,
      startCheckin,
      endCheckin,
    }),
    [courtList, courts.error, courts.loading, activity.data, myCheckin, refresh, startCheckin, endCheckin],
  );

  return <PlayContext.Provider value={value}>{children}</PlayContext.Provider>;
}

export function usePlay(): PlayState {
  const ctx = useContext(PlayContext);
  if (!ctx) throw new Error('usePlay must be used inside PlayProvider');
  return ctx;
}
