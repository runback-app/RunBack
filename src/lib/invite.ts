export function inviteUrl(origin: string, code: string): string {
  return `${origin.replace(/\/+$/, '')}/join/${code}`;
}

/** Preserve a crew invitation when confirmation is opened on another device. */
export function signupRedirect(origin: string, next: string): string {
  const match = /^\/join\/([0-9a-f]+)$/i.exec(next);
  const code = match ? parseInviteCode(match[1]) : null;
  return code ? inviteUrl(origin, code) : origin;
}

export function inviteMessage(crewName: string, url: string): string {
  return `Run with ${crewName} on Runback: ${url}`;
}

/** Opens the phone's texting app with the invite filled in. Works on iPhone and Android. */
export function smsHref(crewName: string, url: string): string {
  return `sms:?&body=${encodeURIComponent(inviteMessage(crewName, url))}`;
}

/** Accepts a full invite link or just the code, returns the code (or null if it doesn't look valid). */
export function parseInviteCode(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const path = trimmed.split(/[?#]/)[0];
  const last = path.split('/').filter(Boolean).pop() ?? '';
  const code = last.toLowerCase();
  // Original invites have 10 hex characters; replaced links have 20.
  return /^(?:[0-9a-f]{10}|[0-9a-f]{20})$/.test(code) ? code : null;
}
