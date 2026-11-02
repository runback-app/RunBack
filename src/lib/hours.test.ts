import { describe, expect, it } from 'vitest';
import { courtStatus, formatDayHours, formatMinute, tucsonClock, weekRows, type WeekHours } from './hours';

// Tucson is UTC-7 all year (Arizona skips daylight saving), so 19:00 UTC = noon in Tucson.
const at = (isoUtc: string) => new Date(isoUtc);

// North Rec: Mon-Thu 6a-10p, Fri 6a-9p, Sat-Sun 8a-9p
const northRec: WeekHours = [[480, 1260], [360, 1320], [360, 1320], [360, 1320], [360, 1320], [360, 1260], [480, 1260]];
// South Rec: open until midnight most nights
const southRec: WeekHours = [[480, 1440], [360, 1440], [360, 1440], [360, 1440], [360, 1440], [360, 1380], [480, 1380]];

describe('tucsonClock', () => {
  it('uses Tucson time, not UTC', () => {
    // Monday Nov 2 2026, 21:30 UTC = 2:30 PM Monday in Tucson
    expect(tucsonClock(at('2026-11-02T21:30:00Z'))).toEqual({ day: 1, minute: 14 * 60 + 30 });
  });

  it('rolls back a day when UTC is already past midnight', () => {
    // Tuesday 03:00 UTC = Monday 8:00 PM in Tucson
    expect(tucsonClock(at('2026-11-03T03:00:00Z'))).toEqual({ day: 1, minute: 20 * 60 });
  });

  it('does not shift for daylight saving (Arizona stays on MST)', () => {
    // July: 19:00 UTC is still noon in Tucson
    expect(tucsonClock(at('2026-07-15T19:00:00Z')).minute).toBe(12 * 60);
  });
});

describe('formatMinute', () => {
  it('formats common times', () => {
    expect(formatMinute(360)).toBe('6 AM');
    expect(formatMinute(1350)).toBe('10:30 PM');
    expect(formatMinute(720)).toBe('noon');
    expect(formatMinute(1440)).toBe('midnight');
    expect(formatMinute(0)).toBe('midnight');
    expect(formatMinute(780)).toBe('1 PM');
  });

  it('formats a day range or closed', () => {
    expect(formatDayHours([480, 1260])).toBe('8 AM – 9 PM');
    expect(formatDayHours(null)).toBe('Closed');
  });
});

describe('courtStatus', () => {
  it('is open in the middle of the day', () => {
    // Monday 2:30 PM
    expect(courtStatus(northRec, at('2026-11-02T21:30:00Z'))).toEqual({
      open: true,
      tone: 'open',
      label: 'Open until 10 PM',
    });
  });

  it('warns when closing within the hour', () => {
    // Monday 9:20 PM -> closes at 10 PM
    expect(courtStatus(northRec, at('2026-11-03T04:20:00Z'))).toEqual({
      open: true,
      tone: 'closing',
      label: 'Closes in 40 min',
    });
  });

  it('is closed at closing time exactly', () => {
    // Monday 10:00 PM
    expect(courtStatus(northRec, at('2026-11-03T05:00:00Z')).open).toBe(false);
  });

  it('says when it opens later today', () => {
    // Saturday 7:00 AM -> opens 8 AM
    expect(courtStatus(northRec, at('2026-11-07T14:00:00Z')).label).toBe('Opens at 8 AM');
  });

  it('says it opens tomorrow after closing', () => {
    // Monday 11:00 PM -> Tuesday 6 AM
    expect(courtStatus(northRec, at('2026-11-03T06:00:00Z')).label).toBe('Opens tomorrow at 6 AM');
  });

  it('handles courts open until midnight', () => {
    // Monday 11:30 PM at South Rec
    expect(courtStatus(southRec, at('2026-11-03T06:30:00Z'))).toEqual({
      open: true,
      tone: 'closing',
      label: 'Closes in 30 min',
    });
  });

  it('skips closed days', () => {
    const weekendsOnly: WeekHours = [[480, 1200], null, null, null, null, null, [480, 1200]];
    // Monday noon -> next open is Saturday
    expect(courtStatus(weekendsOnly, at('2026-11-02T19:00:00Z')).label).toBe('Opens Saturday at 8 AM');
  });

  it('does not crash on bad data', () => {
    expect(courtStatus([] as WeekHours, new Date()).label).toBe('Hours not listed');
    expect(courtStatus([null, null, null, null, null, null, null], new Date()).label).toBe('Hours not listed');
  });
});

describe('weekRows', () => {
  it('starts on Monday and marks today', () => {
    const rows = weekRows(northRec, at('2026-11-02T21:30:00Z'));
    expect(rows[0]).toEqual({ day: 'Monday', hours: '6 AM – 10 PM', today: true });
    expect(rows[6]).toEqual({ day: 'Sunday', hours: '8 AM – 9 PM', today: false });
  });
});
