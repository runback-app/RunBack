export function inviteUrl(origin: string, code: string): string {
  return `${origin.replace(/\/+$/, '')}/join/${code}`;
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
  return /^[0-9a-f]{10}$/.test(code) ? code : null;
}
