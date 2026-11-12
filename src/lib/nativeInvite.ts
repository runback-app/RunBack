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
  return code ? `/join/${code}` : null;
}
