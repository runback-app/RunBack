import { TUCSON_TZ } from './hours';

export const CHECKIN_OPTIONS = [
  { minutes: 60, label: '1 hr' },
  { minutes: 120, label: '2 hrs' },
  { minutes: 180, label: '3 hrs' },
];
export const DEFAULT_CHECKIN_MINUTES = 120;

/** "1h 12m left", "8 min left", "ending now" */
export function timeLeft(expiresAt: string | Date, now: Date): string {
  const end = typeof expiresAt === 'string' ? new Date(expiresAt) : expiresAt;
  const diff = end.getTime() - now.getTime();
  if (diff <= 0) return 'ending now';
  // Round (not ceil) so a few seconds of clock difference between phone and server
  // doesn't turn a fresh 2-hour check-in into "2h 1m left".
  const minutes = Math.max(1, Math.round(diff / 60000));
  if (minutes < 60) return `${minutes} min left`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h left` : `${h}h ${m}m left`;
}

/** "just now", "12 min ago", "2h ago" */
export function timeAgo(value: string | Date, now: Date): string {
  const then = typeof value === 'string' ? new Date(value) : value;
  const minutes = Math.floor((now.getTime() - then.getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

/** "6:12 PM" in Tucson time */
export function clockTime(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat('en-US', {
    timeZone: TUCSON_TZ,
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

export function isLive(checkin: { expires_at: string; ended_at?: string | null }, now: Date): boolean {
  return !checkin.ended_at && new Date(checkin.expires_at).getTime() > now.getTime();
}
