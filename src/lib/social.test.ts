import { describe,it,expect,vi } from 'vitest';
vi.mock('./supabase',()=>({supabase:{}}));
import { tucsonISO,localRunTime,runTime } from './social';
describe('Tucson run scheduling',()=>{
 it('interprets a local time in Tucson, independently of the device timezone',()=>{expect(tucsonISO('2026-11-03T18:00')).toBe('2026-11-04T01:00:00.000Z');});
 it('keeps 6pm in summer and winter without DST',()=>{expect(tucsonISO('2027-07-03T18:00')).toBe('2027-07-04T01:00:00.000Z');});
 it('round trips a date for the run editor',()=>{expect(localRunTime(tucsonISO('2026-12-31T23:30'))).toBe('2026-12-31T23:30');});
 it('rejects missing and malformed dates',()=>{expect(()=>tucsonISO('')).toThrow();expect(()=>tucsonISO('2026-11-03')).toThrow();});
 it('shows the Tucson calendar date across UTC midnight',()=>{expect(runTime('2026-11-04T01:00:00Z')).toContain('Nov 3');expect(runTime('2026-11-04T01:00:00Z')).toContain('6:00');});
});
