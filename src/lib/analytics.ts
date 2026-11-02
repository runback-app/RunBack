/**
 * Strips private bits from page addresses before they're counted:
 * invite codes, crew and player ids, and anything after ? or #.
 * "/join/a1b2c3d4e5?x=1" -> "/join/[code]"
 */
export function cleanPageUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url, 'https://runback.local');
  } catch {
    return '/';
  }
  const path = parsed.pathname
    .replace(/^\/join\/[^/]+/, '/join/[code]')
    .replace(/^\/crew\/[^/]+/, '/crew/[id]')
    .replace(/^\/player\/[^/]+/, '/player/[id]')
    .replace(/^\/run\/[^/]+/, '/run/[id]');
  return /^https?:\/\//.test(url) ? `${parsed.origin}${path}` : path;
}
