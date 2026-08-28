/**
 * Utility functions for parsing custom dates and intervals.
 * Enhanced validation for graceful error handling.
 */

/**
 * Parses a date string in format DD/MM/YYYY or DD/MM/YYYY HH:MM
 * Returns a Date object if valid, null otherwise.
 */
export function parseCustomDate(input: string): Date | null {
  const str = input.trim();
  // Regex to match DD/MM/YYYY or DD/MM/YYYY HH:MM
  const regex = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/;
  const match = str.match(regex);
  if (!match) return null;

  const day = parseInt(match[1], 10);
  const month = parseInt(match[2], 10) - 1; // JS months are 0-indexed
  const year = parseInt(match[3], 10);
  const hour = match[4] ? parseInt(match[4], 10) : 12; // Default to noon if no time provided
  const minute = match[5] ? parseInt(match[5], 10) : 0;

  // Validate ranges
  if (month < 0 || month > 11) return null;
  if (day < 1 || day > 31) return null;
  if (hour < 0 || hour > 23) return null;
  if (minute < 0 || minute > 59) return null;
  if (year < 2024 || year > 2100) return null; // Reasonable year range

  const date = new Date(year, month, day, hour, minute);

  // Validate the parsed date (JS Date is forgiving and wraps around invalid days)
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month ||
    date.getDate() !== day
  ) {
    return null;
  }

  // Ensure date is in the future
  if (date <= new Date()) {
    return null;
  }

  return date;
}

/**
 * Parses a repeating interval string like "every 2 hours", "every 5 days", "every week".
 * Returns the interval in minutes, or null if invalid.
 */
export function parseCycleInterval(input: string): number | null {
  const str = input.trim().toLowerCase();
  
  // Quick shorthand matches
  if (
    str === "every day" || str === "daily" || str === "every evening" ||
    str === "har kuni" || str === "har kun" || str === "kunlik" || str === "har kecha"
  ) return 1440;
  if (
    str === "twice a day" || str === "every 12 hours" ||
    str === "kuniga ikki marta" || str === "kuniga 2 marta" || str === "har 12 soatda"
  ) return 720;
  if (
    str === "every week" || str === "weekly" ||
    str === "har hafta" || str === "haftalik" || str === "har haftada"
  ) return 10080;
  if (
    str === "every month" || str === "monthly" ||
    str === "har oy" || str === "oylik" || str === "har oyda"
  ) return 43200;

  // Regex to match "every X hours/days/minutes"
  const regex = /every\s+(\d+)\s+(minute|hour|day|week|month)s?/i;
  const match = str.match(regex);
  if (match) {
    const value = parseInt(match[1], 10);
    const unit = match[2];

    if (isNaN(value) || value <= 0 || value > 10000) return null;

    switch (unit) {
      case "minute":
        return value;
      case "hour":
        return value * 60;
      case "day":
        return value * 1440;
      case "week":
        return value * 10080;
      case "month":
        return value * 43200;
      default:
        return null;
    }
  }

  // Regex to match Uzbek: "har X daqiqa/soat/kun/hafta/oy" (masalan: "har 2 soatda", "har 3 kunda", "har 5 daqiqada")
  const uzRegex = /har\s+(\d+)\s+(daqiqa|minut|soat|kun|hafta|oy)(?:da)?/i;
  const uzMatch = str.match(uzRegex);
  if (uzMatch) {
    const value = parseInt(uzMatch[1], 10);
    const unit = uzMatch[2].toLowerCase();

    if (isNaN(value) || value <= 0 || value > 10000) return null;

    if (unit === "daqiqa" || unit === "minut") return value;
    if (unit === "soat") return value * 60;
    if (unit === "kun") return value * 1440;
    if (unit === "hafta") return value * 10080;
    if (unit === "oy") return value * 43200;
  }

  return null;
}

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9,
  oct: 10, nov: 11, dec: 12,
  yanvar: 1, fevral: 2, mart: 3, aprel: 4, mayis: 5, iyun: 6,
  iyul: 7, avgust: 8, sentabr: 9, sentyabr: 9, oktabr: 10, oktyabr: 10,
  noyabr: 11, dekabr: 12,
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function isValidYmd(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/**
 * Parses clock time: "20:00", "8 PM", "8:00pm", "08:00".
 * Bare 1–12 is treated as that hour in 24h (8 → 08:00), matching "at 8 until…".
 */
export function parseClockTime(input: string): string | null {
  const str = input.trim().toLowerCase().replace(/\s+/g, " ");

  const ampm = str.match(/^(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)$/i);
  if (ampm) {
    let hour = parseInt(ampm[1], 10);
    const minute = ampm[2] ? parseInt(ampm[2], 10) : 0;
    const isPm = ampm[3].startsWith("p");
    if (hour < 1 || hour > 12 || minute > 59) return null;
    if (isPm && hour !== 12) hour += 12;
    if (!isPm && hour === 12) hour = 0;
    return `${pad(hour)}:${pad(minute)}`;
  }

  const twentyFour = str.match(/^(\d{1,2}):(\d{2})$/);
  if (twentyFour) {
    const hour = parseInt(twentyFour[1], 10);
    const minute = parseInt(twentyFour[2], 10);
    if (hour > 23 || minute > 59) return null;
    return `${pad(hour)}:${pad(minute)}`;
  }

  const bareHour = str.match(/^(\d{1,2})$/);
  if (bareHour) {
    const hour = parseInt(bareHour[1], 10);
    if (hour > 23) return null;
    return `${pad(hour)}:00`;
  }

  return null;
}

/**
 * Parses a calendar date to YYYY-MM-DD without inventing a time.
 * Accepts YYYY-MM-DD, DD/MM/YYYY, and "September 1" / "1 September 2026".
 */
export function parseFlexibleDateYmd(input: string, todayYmd: string): string | null {
  const str = input.trim().replace(/^until\s+/i, "");
  const [ty, tm, td] = todayYmd.split("-").map(Number);

  const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const year = parseInt(iso[1], 10);
    const month = parseInt(iso[2], 10);
    const day = parseInt(iso[3], 10);
    return isValidYmd(year, month, day) ? `${year}-${pad(month)}-${pad(day)}` : null;
  }

  const dmy = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) {
    const day = parseInt(dmy[1], 10);
    const month = parseInt(dmy[2], 10);
    const year = parseInt(dmy[3], 10);
    return isValidYmd(year, month, day) ? `${year}-${pad(month)}-${pad(day)}` : null;
  }

  const named = str.match(
    /^(?:(\d{1,2})\s+)?(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)(?:\s+(\d{1,2}))?(?:,?\s+(\d{4}))?$/i
  );
  if (named) {
    const month = MONTHS[named[2].toLowerCase()];
    const day = parseInt(named[1] || named[3], 10);
    if (!month || Number.isNaN(day)) return null;
    let year = named[4] ? parseInt(named[4], 10) : ty;
    if (!named[4]) {
      const candidate = `${year}-${pad(month)}-${pad(day)}`;
      if (candidate < todayYmd) year += 1;
    }
    return isValidYmd(year, month, day) ? `${year}-${pad(month)}-${pad(day)}` : null;
  }

  if (/^(today|bugun)$/i.test(str)) return `${ty}-${pad(tm)}-${pad(td)}`;

  void td;
  return null;
}

export function parseRecurrence(input: string): { intervalMinutes: number; recurrenceText: string } | null {
  const str = input.trim().toLowerCase();
  if (str === "every evening" || str === "evenings" || str === "har kecha") {
    return { intervalMinutes: 1440, recurrenceText: "Har kuni" };
  }
  if (str === "twice a day" || str === "kuniga 2 marta" || str === "kuniga ikki marta") {
    return { intervalMinutes: 720, recurrenceText: "Kuniga ikki marta" };
  }

  const minutes = parseCycleInterval(str);
  if (!minutes) return null;

  if (minutes === 1440) return { intervalMinutes: minutes, recurrenceText: "Har kuni" };
  if (minutes === 10080) return { intervalMinutes: minutes, recurrenceText: "Har hafta" };
  if (minutes === 43200) return { intervalMinutes: minutes, recurrenceText: "Har oy" };
  if (minutes % 1440 === 0) {
    const days = minutes / 1440;
    return { intervalMinutes: minutes, recurrenceText: `Har ${days} kunda` };
  }
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return { intervalMinutes: minutes, recurrenceText: `Har ${hours} soatda` };
  }
  return { intervalMinutes: minutes, recurrenceText: `Har ${minutes} daqiqada` };
}
