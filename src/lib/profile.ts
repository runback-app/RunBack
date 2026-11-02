export const POSITIONS = [
  { value: 'PG', label: 'Point guard' },
  { value: 'SG', label: 'Shooting guard' },
  { value: 'SF', label: 'Small forward' },
  { value: 'PF', label: 'Power forward' },
  { value: 'C', label: 'Center' },
] as const;

export const SKILLS = [
  { value: 'fun', label: 'Just for fun' },
  { value: 'regular', label: 'Plays a lot' },
  { value: 'competitive', label: 'Competitive' },
  { value: 'college', label: 'Played in college' },
] as const;

export type Position = (typeof POSITIONS)[number]['value'];
export type Skill = (typeof SKILLS)[number]['value'];

export function positionLabel(value: string | null | undefined): string | null {
  return POSITIONS.find((p) => p.value === value)?.label ?? null;
}

export function skillLabel(value: string | null | undefined): string | null {
  return SKILLS.find((s) => s.value === value)?.label ?? null;
}

/** 74 -> 6'2" */
export function formatHeight(inches: number | null | undefined): string | null {
  if (!inches || inches < 48 || inches > 96) return null;
  return `${Math.floor(inches / 12)}'${inches % 12}"`;
}

/** "PG, 6'2", Competitive" — only the parts the player filled in. */
export function playerSummary(p: {
  position?: string | null;
  height_in?: number | null;
  skill?: string | null;
}): string {
  return [p.position ?? null, formatHeight(p.height_in), skillLabel(p.skill)].filter(Boolean).join(', ');
}

/** "Alex Test" -> "AT", "bo" -> "B" */
export function initials(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? '' : '';
  return (first + last).toUpperCase();
}

/** Stable color per name so the same player always gets the same initials circle. */
const AVATAR_COLORS = ['#2e6b4e', '#8a4300', '#3b5b8c', '#6b4c8a', '#7a5a1c', '#2f6f73'];
export function avatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}
