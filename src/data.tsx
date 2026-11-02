import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import {
  addFavorite,
  checkIn,
  checkOut,
  fetchActivity,
  fetchCourts,
  fetchFavorites,
  fetchLiveCheckins,
  fetchMyCheckin,
  removeFavorite,
  updateFavorite,
} from './lib/api';
import type { Checkin, Court, Favorite, LiveCheckin } from './lib/types';
import { useAuth } from './auth';
import { useLoad } from './hooks';

type PlayState = {
  courts: Court[];
  courtsError: string | null;
  courtsLoading: boolean;
  /** Player count per court id (public). */
  activity: Record<string, number>;
  /** Everyone checked in right now, with names and photos (signed-in only). */
  live: LiveCheckin[];
  liveLoaded: boolean;
  myCheckin: Checkin | null;
  myCourt: Court | null;
  favorites: Favorite[];
  isFavorite: (courtId: string) => boolean;
  refresh: () => Promise<void>;
  startCheckin: (courtId: string, minutes: number) => Promise<void>;
  endCheckin: () => Promise<void>;
  setFavorite: (courtId: string, on: boolean) => Promise<void>;
  changeFavorite: (courtId: string, changes: Partial<Pick<Favorite, 'alerts' | 'alert_at'>>) => Promise<void>;
};

const PlayContext = createContext<PlayState | null>(null);
const none = Promise.resolve(null);

export function PlayProvider({ children }: { children: ReactNode }) {
  const { userId } = useAuth();
  const courts = useLoad(fetchCourts, []);
  const activity = useLoad(fetchActivity, [], 30000);
  const mine = useLoad(() => (userId ? fetchMyCheckin(userId) : none), [userId], 60000);
  const live = useLoad(() => (userId ? fetchLiveCheckins() : Promise.resolve([])), [userId], 30000);
  const favs = useLoad(() => (userId ? fetchFavorites() : Promise.resolve([])), [userId]);

  const reloadActivity = activity.reload;
  const reloadMine = mine.reload;
  const reloadLive = live.reload;
  const reloadFavs = favs.reload;

  const refresh = useCallback(async () => {
    await Promise.all([reloadActivity(), reloadMine(), reloadLive()]);
  }, [reloadActivity, reloadMine, reloadLive]);

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

  const favoriteList = favs.data ?? [];

  const setFavorite = useCallback(
    async (courtId: string, on: boolean) => {
      if (!userId) throw new Error('Sign in to save courts.');
      if (on) await addFavorite(userId, courtId);
      else await removeFavorite(userId, courtId);
      await reloadFavs();
    },
    [userId, reloadFavs],
  );

  const changeFavorite = useCallback(
    async (courtId: string, changes: Partial<Pick<Favorite, 'alerts' | 'alert_at'>>) => {
      if (!userId) throw new Error('Sign in first.');
      await updateFavorite(userId, courtId, changes);
      await reloadFavs();
    },
    [userId, reloadFavs],
  );

  const myCheckin = mine.data ?? null;
  const courtList = courts.data ?? [];

  const value = useMemo<PlayState>(
    () => ({
      courts: courtList,
      courtsError: courts.error,
      courtsLoading: courts.loading,
      activity: activity.data ?? {},
      live: live.data ?? [],
      liveLoaded: live.data !== undefined && !live.loading,
      myCheckin,
      myCourt: myCheckin ? courtList.find((c) => c.id === myCheckin.court_id) ?? null : null,
      favorites: favoriteList,
      isFavorite: (courtId: string) => favoriteList.some((f) => f.court_id === courtId),
      refresh,
      startCheckin,
      endCheckin,
      setFavorite,
      changeFavorite,
    }),
    [
      courtList,
      courts.error,
      courts.loading,
      activity.data,
      live.data,
      live.loading,
      myCheckin,
      favoriteList,
      refresh,
      startCheckin,
      endCheckin,
      setFavorite,
      changeFavorite,
    ],
  );

  return <PlayContext.Provider value={value}>{children}</PlayContext.Provider>;
}

export function usePlay(): PlayState {
  const ctx = useContext(PlayContext);
  if (!ctx) throw new Error('usePlay must be used inside PlayProvider');
  return ctx;
}
