import { parseInviteCode } from './invite';

export function nativeInvitePath(rawUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.origin !== 'https://runback.net' || url.username || url.password || url.search || url.hash) {
    return null;
  }
  const match = /^\/join\/([0-9a-f]+)\/?$/i.exec(url.pathname);
  const code = match ? parseInviteCode(match[1]) : null;
  if (code) return `/join/${code}`;
  if (/^\/add\/[A-Za-z0-9_]{3,20}$/.test(url.pathname)) return url.pathname;
  return nativeNotificationPath(url.pathname);
}

/** Notification targets are internal routes, never auth callbacks or outside URLs. */
export function nativeNotificationPath(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
  if (new RegExp(`^/(run|crew|player)/${uuid}$`, 'i').test(value)) return value;
  if (/^\/court\/[a-z0-9-]+$/.test(value) || value === '/updates') return value;
  return null;
}
