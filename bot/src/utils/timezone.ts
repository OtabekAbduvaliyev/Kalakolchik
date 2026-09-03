// ----------------------------------------------------------------
// Timezone helpers
// Default is Asia/Tashkent until per-user timezone exists.
// ----------------------------------------------------------------

export const DEFAULT_TIMEZONE = "Asia/Tashkent";

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  date: string;
  time: string;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function getZonedParts(date: Date, timeZone: string): ZonedParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  const raw = Object.fromEntries(
    fmt.formatToParts(date)
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value])
  );

  let hour = Number(raw.hour);
  if (hour === 24) hour = 0;

  const year = Number(raw.year);
  const month = Number(raw.month);
  const day = Number(raw.day);
  const minute = Number(raw.minute);

  return {
    year,
    month,
    day,
    hour,
    minute,
    date: `${year}-${pad(month)}-${pad(day)}`,
    time: `${pad(hour)}:${pad(minute)}`,
  };
}

export function todayInTimeZone(timeZone: string): string {
  return getZonedParts(new Date(), timeZone).date;
}

export function timeInTimeZone(date: Date, timeZone: string): string {
  return getZonedParts(date, timeZone).time;
}

export function nowContext(timeZone: string): { date: string; time: string; iso: string } {
  const parts = getZonedParts(new Date(), timeZone);
  return { date: parts.date, time: parts.time, iso: new Date().toISOString() };
}

/**
 * Interpret YYYY-MM-DD + HH:MM as wall-clock time in `timeZone`, return a UTC Date.
 */
export function zonedWallTimeToUtc(
  dateYmd: string,
  timeHm: string,
  timeZone: string
): Date | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateYmd);
  const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(timeHm);
  if (!dateMatch || !timeMatch) return null;

  const y = Number(dateMatch[1]);
  const mo = Number(dateMatch[2]);
  const d = Number(dateMatch[3]);
  const h = Number(timeMatch[1]);
  const mi = Number(timeMatch[2]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;

  let utc = Date.UTC(y, mo - 1, d, h, mi, 0);
  for (let i = 0; i < 3; i++) {
    const parts = getZonedParts(new Date(utc), timeZone);
    const wanted = Date.UTC(y, mo - 1, d, h, mi, 0);
    const got = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      0
    );
    utc += wanted - got;
  }

  return new Date(utc);
}

const UZ_MONTHS = [
  "yanvar", "fevral", "mart", "aprel", "may", "iyun",
  "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"
];

export function formatLongDate(ymd: string, timeZone: string): string {
  const dt = zonedWallTimeToUtc(ymd, "12:00", timeZone);
  if (!dt) return ymd;
  const parts = getZonedParts(dt, timeZone);
  const monthName = UZ_MONTHS[parts.month - 1] ?? "";
  return `${parts.day}-${monthName}, ${parts.year}`;
}

export function endOfDateInTimeZone(ymd: string, timeZone: string): Date | null {
  return zonedWallTimeToUtc(ymd, "23:59", timeZone);
}

/**
 * Validates if an IANA timezone string is recognized by Intl.
 */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Formats a Date in the given timezone as readable Uzbek date and time:
 * e.g. "4-sentabr, 2026 20:15"
 */
export function formatZoned(date: Date, timeZone: string): string {
  const parts = getZonedParts(date, timeZone);
  const monthName = UZ_MONTHS[parts.month - 1] ?? "";
  return `${parts.day}-${monthName}, ${parts.year} ${parts.time}`;
}

/**
 * Formats a Date in the given timezone with the timezone name:
 * e.g. "4-sentabr, 2026 20:15 (Asia/Tashkent)"
 */
export function formatZonedWithTz(date: Date, timeZone: string): string {
  return `${formatZoned(date, timeZone)} (${timeZone})`;
}

export interface TimezonePreset {
  label: string;
  value: string;
}

export const TIMEZONE_PRESETS: TimezonePreset[] = [
  { label: "🇺🇿 Toshkent (UTC+5)", value: "Asia/Tashkent" },
  { label: "🇺🇿 Samarqand (UTC+5)", value: "Asia/Samarkand" },
  { label: "🇷🇺 Moskva (UTC+3)", value: "Europe/Moscow" },
  { label: "🇦🇪 Dubay (UTC+4)", value: "Asia/Dubai" },
  { label: "🇰🇿 Almati (UTC+5)", value: "Asia/Almaty" },
  { label: "🇹🇷 Istanbul (UTC+3)", value: "Europe/Istanbul" },
  { label: "🇬🇧 London (UTC+0/+1)", value: "Europe/London" },
  { label: "🇺🇸 Nyu-York (UTC-5/-4)", value: "America/New_York" },
];

