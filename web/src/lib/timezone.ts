export type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

export function getZonedParts(date: Date, timeZone: string): ZonedParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const bag = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value]),
  );
  return {
    year: Number(bag.year),
    month: Number(bag.month),
    day: Number(bag.day),
    hour: bag.hour === "24" ? 0 : Number(bag.hour),
    minute: Number(bag.minute),
    second: Number(bag.second),
  };
}

export function formatYmdInZone(date: Date, timeZone: string) {
  const parts = getZonedParts(date, timeZone);
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function zonedLocalToUtc(ymd: string, time: string, timeZone: string) {
  const [year, month, day] = ymd.split("-").map(Number);
  const [hour, minute, second] = time.split(":").map(Number);
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

export function addCalendarDays(ymd: string, days: number) {
  const [year, month, day] = ymd.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
}

export function utcToZonedInput(iso: string | null, timeZone: string) {
  if (!iso) return { date: "", time: "" };
  const parts = getZonedParts(new Date(iso), timeZone);
  return {
    date: `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`,
    time: `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`,
  };
}

export function formatTimeInZone(iso: string | null, timeZone: string) {
  if (!iso) return "Unscheduled";
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function formatDateTimeInZone(iso: string | null, timeZone: string) {
  if (!iso) return "Unscheduled";
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

export type WorkWeekDayCode =
  | "MON"
  | "TUE"
  | "WED"
  | "THU"
  | "FRI"
  | "SAT"
  | "SUN";

const WEEKDAY_LABELS: Record<WorkWeekDayCode, string> = {
  MON: "Monday",
  TUE: "Tuesday",
  WED: "Wednesday",
  THU: "Thursday",
  FRI: "Friday",
  SAT: "Saturday",
  SUN: "Sunday",
};

/** Day-of-week code for an instant in an IANA timezone (matches API weekdayCodeInZone). */
export function weekdayCodeInZone(
  date: Date,
  timeZone: string,
): WorkWeekDayCode {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  }).format(date);
  const map: Record<string, WorkWeekDayCode> = {
    Mon: "MON",
    Tue: "TUE",
    Wed: "WED",
    Thu: "THU",
    Fri: "FRI",
    Sat: "SAT",
    Sun: "SUN",
  };
  return map[weekday] ?? "MON";
}

export function weekdayLabel(code: WorkWeekDayCode) {
  return WEEKDAY_LABELS[code];
}

/** True when the scheduled instant falls outside the org's normal working week. */
export function isOutsideWorkingWeek(
  scheduledAt: Date | string | null | undefined,
  timeZone: string,
  workingWeek: string[] | null | undefined,
): { outside: boolean; weekday: WorkWeekDayCode; weekdayName: string } {
  const week = (workingWeek ?? []).map((d) => d.toUpperCase());
  if (!scheduledAt || week.length === 0) {
    return { outside: false, weekday: "MON", weekdayName: "Monday" };
  }
  const date =
    typeof scheduledAt === "string" ? new Date(scheduledAt) : scheduledAt;
  if (Number.isNaN(date.getTime())) {
    return { outside: false, weekday: "MON", weekdayName: "Monday" };
  }
  const weekday = weekdayCodeInZone(date, timeZone);
  return {
    outside: !week.includes(weekday),
    weekday,
    weekdayName: weekdayLabel(weekday),
  };
}

export function outsideWorkingDayMessage(weekdayName: string) {
  return `${weekdayName} is outside this organization's normal working week. Continue scheduling this job?`;
}
