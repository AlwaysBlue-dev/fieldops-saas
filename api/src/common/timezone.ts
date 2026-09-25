import { DEFAULT_JOB_WINDOW_MINUTES, WORK_WEEK_DAYS, type WorkWeekDay } from './constants.js';

export type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True for identifiers accepted by Intl (IANA / UTC). */
export function isValidIanaTimeZone(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 64) return false;
  try {
    Intl.DateTimeFormat('en-US', { timeZone: trimmed });
    return true;
  } catch {
    return false;
  }
}

export function assertValidIanaTimeZone(value: string): string {
  const trimmed = value.trim();
  if (!isValidIanaTimeZone(trimmed)) {
    throw new Error('Please select a valid timezone.');
  }
  return trimmed;
}

export function isYmd(value: string) {
  return YMD.test(value);
}

export function formatYmdInZone(date: Date, timeZone: string): string {
  const parts = getZonedParts(date, timeZone);
  return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

export function getZonedParts(date: Date, timeZone: string): ZonedParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const bag = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value]),
  );
  return {
    year: Number(bag.year),
    month: Number(bag.month),
    day: Number(bag.day),
    hour: bag.hour === '24' ? 0 : Number(bag.hour),
    minute: Number(bag.minute),
    second: Number(bag.second),
  };
}

export function zonedLocalToUtc(
  ymd: string,
  time: string,
  timeZone: string,
): Date {
  if (!YMD.test(ymd)) {
    throw new Error('Expected YYYY-MM-DD');
  }
  const [year, month, day] = ymd.split('-').map(Number);
  const [hour, minute, second] = time.split(':').map(Number);
  let guess = Date.UTC(year, month - 1, day, hour, minute, second ?? 0);
  for (let i = 0; i < 4; i += 1) {
    const parts = getZonedParts(new Date(guess), timeZone);
    const asUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
    const desired = Date.UTC(year, month - 1, day, hour, minute, second ?? 0);
    guess -= asUtc - desired;
  }
  return new Date(guess);
}

export function addCalendarDays(ymd: string, days: number): string {
  const [year, month, day] = ymd.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
}

function weekdayMondayBased(ymd: string, timeZone: string): number {
  const noon = zonedLocalToUtc(ymd, '12:00:00', timeZone);
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
  }).format(noon);
  const map: Record<string, number> = {
    Mon: 0,
    Tue: 1,
    Wed: 2,
    Thu: 3,
    Fri: 4,
    Sat: 5,
    Sun: 6,
  };
  return map[weekday] ?? 0;
}

export function weekdayCodeInZone(date: Date, timeZone: string): WorkWeekDay {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
  }).format(date);
  const map: Record<string, WorkWeekDay> = {
    Mon: 'MON',
    Tue: 'TUE',
    Wed: 'WED',
    Thu: 'THU',
    Fri: 'FRI',
    Sat: 'SAT',
    Sun: 'SUN',
  };
  return map[weekday] ?? WORK_WEEK_DAYS[0];
}

export function mondayOnOrBefore(ymd: string, timeZone: string): string {
  return addCalendarDays(ymd, -weekdayMondayBased(ymd, timeZone));
}

export function zonedDayRange(ymd: string, timeZone: string) {
  const start = zonedLocalToUtc(ymd, '00:00:00', timeZone);
  const end = zonedLocalToUtc(addCalendarDays(ymd, 1), '00:00:00', timeZone);
  return { start, end };
}

export function zonedWeekRange(ymd: string, timeZone: string) {
  const monday = mondayOnOrBefore(ymd, timeZone);
  const start = zonedLocalToUtc(monday, '00:00:00', timeZone);
  const end = zonedLocalToUtc(addCalendarDays(monday, 7), '00:00:00', timeZone);
  return { start, end, monday };
}

export function jobWindow(
  scheduledStart: Date | null,
  expectedFinish: Date | null,
  windowMinutes = DEFAULT_JOB_WINDOW_MINUTES,
): { start: Date; end: Date } | null {
  if (!scheduledStart) {
    return null;
  }
  const start = scheduledStart;
  const rawEnd = expectedFinish ?? new Date(start.getTime() + windowMinutes * 60_000);
  const end =
    rawEnd.getTime() <= start.getTime()
      ? new Date(start.getTime() + windowMinutes * 60_000)
      : rawEnd;
  return { start, end };
}

export function windowsOverlap(
  left: { start: Date; end: Date },
  right: { start: Date; end: Date },
) {
  return left.start.getTime() < right.end.getTime() && right.start.getTime() < left.end.getTime();
}
