// Court hours are stored as 7 entries (Sunday..Saturday).
// Each entry is [openMinute, closeMinute] in Tucson time, or null when closed all day.
// Example: [360, 1320] means 6 AM to 10 PM. 1440 means midnight at the end of the day.

export type DayHours = [number, number] | null;
export type WeekHours = DayHours[];

export const TUCSON_TZ = 'America/Phoenix';
export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const FULL_DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Day of week (0 = Sunday) and minute of the day, in Tucson time. */
export function tucsonClock(date: Date): { day: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TUCSON_TZ,
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const day = DAY_NAMES.indexOf(get('weekday'));
  const hour = Number(get('hour')) % 24;
  const minute = Number(get('minute'));
  return { day, minute: hour * 60 + minute };
}

/** 360 -> "6 AM", 1350 -> "10:30 PM", 720 -> "noon", 1440 -> "midnight" */
export function formatMinute(total: number): string {
  if (total === 0 || total === 1440) return 'midnight';
  if (total === 720) return 'noon';
  const hour24 = Math.floor(total / 60);
  const minute = total % 60;
  const suffix = hour24 < 12 ? 'AM' : 'PM';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return minute === 0 ? `${hour12} ${suffix}` : `${hour12}:${String(minute).padStart(2, '0')} ${suffix}`;
}

export function formatDayHours(hours: DayHours): string {
  if (!hours) return 'Closed';
  return `${formatMinute(hours[0])} – ${formatMinute(hours[1])}`;
}

export type CourtStatus = {
  open: boolean;
  tone: 'open' | 'closing' | 'closed';
  label: string;
};

/** Whether a court is open right now, with a short label like "Open until 10 PM". */
export function courtStatus(week: WeekHours, now: Date): CourtStatus {
  if (!Array.isArray(week) || week.length !== 7) {
    return { open: false, tone: 'closed', label: 'Hours not listed' };
  }
  const { day, minute } = tucsonClock(now);
  const today = week[day];

  if (today && minute >= today[0] && minute < today[1]) {
    const left = today[1] - minute;
    if (left <= 60) {
      return { open: true, tone: 'closing', label: `Closes in ${left} min` };
    }
    return { open: true, tone: 'open', label: `Open until ${formatMinute(today[1])}` };
  }

  if (today && minute < today[0]) {
    return { open: false, tone: 'closed', label: `Opens at ${formatMinute(today[0])}` };
  }

  for (let offset = 1; offset <= 7; offset++) {
    const next = week[(day + offset) % 7];
    if (next) {
      const when = offset === 1 ? 'tomorrow' : FULL_DAY_NAMES[(day + offset) % 7];
      return { open: false, tone: 'closed', label: `Opens ${when} at ${formatMinute(next[0])}` };
    }
  }
  return { open: false, tone: 'closed', label: 'Hours not listed' };
}

/** Rows for an hours table, starting on Monday like most posted schedules. */
export function weekRows(week: WeekHours, now: Date): { day: string; hours: string; today: boolean }[] {
  const { day: todayIndex } = tucsonClock(now);
  return [1, 2, 3, 4, 5, 6, 0].map((i) => ({
    day: FULL_DAY_NAMES[i],
    hours: formatDayHours(week[i] ?? null),
    today: i === todayIndex,
  }));
}
