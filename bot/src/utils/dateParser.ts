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
  if (str === "every day" || str === "daily") return 1440; // 24 * 60
  if (str === "every week" || str === "weekly") return 10080; // 7 * 24 * 60
  if (str === "every month" || str === "monthly") return 43200; // 30 * 24 * 60 (approx)

  // Regex to match "every X hours/days/minutes"
  const regex = /every\s+(\d+)\s+(minute|hour|day|week|month)s?/i;
  const match = str.match(regex);
  if (!match) return null;

  const value = parseInt(match[1], 10);
  const unit = match[2];

  // Validate the numeric value
  if (isNaN(value) || value <= 0) return null;
  
  // Add reasonable upper limits to prevent abuse
  if (value > 10000) return null; // Cap at 10000 units

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
