import { describe, expect, it } from 'vitest';
import {
  addCalendarDays,
  formatYmdInZone,
  jobWindow,
  mondayOnOrBefore,
  windowsOverlap,
  zonedDayRange,
  zonedLocalToUtc,
  zonedWeekRange,
} from './timezone.js';

describe('timezone helpers', () => {
  it('converts Chicago winter midnight to UTC-6', () => {
    const start = zonedLocalToUtc('2026-01-15', '00:00:00', 'America/Chicago');
    expect(start.toISOString()).toBe('2026-01-15T06:00:00.000Z');
  });

  it('converts Chicago summer midnight to UTC-5', () => {
    const start = zonedLocalToUtc('2026-07-15', '00:00:00', 'America/Chicago');
    expect(start.toISOString()).toBe('2026-07-15T05:00:00.000Z');
  });

  it('builds an exclusive org-day range', () => {
    const { start, end } = zonedDayRange('2026-01-15', 'America/Chicago');
    expect(start.toISOString()).toBe('2026-01-15T06:00:00.000Z');
    expect(end.toISOString()).toBe('2026-01-16T06:00:00.000Z');
  });

  it('snaps week ranges to Monday in the organization timezone', () => {
    const week = zonedWeekRange('2026-09-23', 'America/Chicago');
    expect(week.monday).toBe('2026-09-21');
    expect(mondayOnOrBefore('2026-09-21', 'America/Chicago')).toBe('2026-09-21');
    expect(addCalendarDays('2026-09-21', 7)).toBe('2026-09-28');
    expect(formatYmdInZone(week.start, 'America/Chicago')).toBe('2026-09-21');
  });

  it('treats a missing finish as a two-hour window and detects overlap', () => {
    const start = new Date('2026-09-23T15:00:00.000Z');
    const left = jobWindow(start, null);
    const right = jobWindow(
      new Date('2026-09-23T16:00:00.000Z'),
      new Date('2026-09-23T17:00:00.000Z'),
    );
    expect(left?.end.toISOString()).toBe('2026-09-23T17:00:00.000Z');
    expect(windowsOverlap(left!, right!)).toBe(true);
    const later = jobWindow(
      new Date('2026-09-23T17:00:00.000Z'),
      new Date('2026-09-23T18:00:00.000Z'),
    );
    expect(windowsOverlap(left!, later!)).toBe(false);
  });
});
