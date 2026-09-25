/** Browser timezone helpers for onboarding / settings. */

const FALLBACK_TIME_ZONES = [
  "UTC",
  "Africa/Cairo",
  "Africa/Johannesburg",
  "Africa/Lagos",
  "Africa/Nairobi",
  "America/Anchorage",
  "America/Argentina/Buenos_Aires",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Mexico_City",
  "America/New_York",
  "America/Phoenix",
  "America/Sao_Paulo",
  "America/Toronto",
  "America/Vancouver",
  "Asia/Dubai",
  "Asia/Hong_Kong",
  "Asia/Karachi",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Melbourne",
  "Australia/Perth",
  "Australia/Sydney",
  "Europe/Amsterdam",
  "Europe/Berlin",
  "Europe/London",
  "Europe/Madrid",
  "Europe/Moscow",
  "Europe/Paris",
  "Pacific/Auckland",
  "Pacific/Honolulu",
] as const;

export function listIanaTimeZones(): string[] {
  try {
    const supported = (
      Intl as typeof Intl & {
        supportedValuesOf?: (key: string) => string[];
      }
    ).supportedValuesOf?.("timeZone");
    if (Array.isArray(supported) && supported.length > 0) {
      return [...supported].sort((a, b) => a.localeCompare(b));
    }
  } catch {
    // Fall through.
  }
  return [...FALLBACK_TIME_ZONES];
}

export function detectBrowserTimeZone(): string | null {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (zone && isValidIanaTimeZone(zone)) return zone;
  } catch {
    // Ignore.
  }
  return null;
}

export function isValidIanaTimeZone(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 64) return false;
  try {
    Intl.DateTimeFormat("en-US", { timeZone: trimmed });
    return true;
  } catch {
    return false;
  }
}

export function formatUtcOffsetLabel(
  timeZone: string,
  at: Date = new Date(),
): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "longOffset",
    }).formatToParts(at);
    const name = parts.find((part) => part.type === "timeZoneName")?.value;
    if (name) {
      // "GMT+5" / "GMT+05:00" / "GMT"
      const normalized = name.replace(/^GMT/, "UTC");
      if (normalized === "UTC") return "UTC+00:00";
      const match = normalized.match(/^UTC([+-])(\d{1,2})(?::?(\d{2}))?$/);
      if (match) {
        const sign = match[1];
        const hours = match[2].padStart(2, "0");
        const minutes = (match[3] ?? "00").padStart(2, "0");
        return `UTC${sign}${hours}:${minutes}`;
      }
      return normalized;
    }
  } catch {
    // Fall through.
  }
  return "";
}

export function timezoneOptionLabel(timeZone: string): string {
  const offset = formatUtcOffsetLabel(timeZone);
  return offset ? `${timeZone} (${offset})` : timeZone;
}
