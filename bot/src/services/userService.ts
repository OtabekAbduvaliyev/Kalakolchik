import { supabase } from "../db/supabase";
import { DEFAULT_TIMEZONE, isValidTimeZone } from "../utils/timezone";

// ----------------------------------------------------------------
// User Service
// Handles user lookup, registration, and timezone management in the `users` table.
// ----------------------------------------------------------------

// In-memory cache for fast timezone lookups
const userTimezoneCache = new Map<number, string>();

/**
 * Finds an existing user by their Telegram ID, or creates a new one.
 * Returns the user's internal UUID.
 */
export async function upsertUser(telegramId: number, timezone: string = DEFAULT_TIMEZONE): Promise<string> {
  // First, try to find the existing user
  const { data: existing, error: findError } = await supabase
    .from("users")
    .select("id, timezone")
    .eq("telegram_id", telegramId)
    .maybeSingle();

  if (findError) {
    // If error might be missing timezone column, fallback to selecting id only
    if (/timezone/i.test(findError.message)) {
      const fallback = await supabase
        .from("users")
        .select("id")
        .eq("telegram_id", telegramId)
        .maybeSingle();
      if (fallback.data) {
        userTimezoneCache.set(telegramId, DEFAULT_TIMEZONE);
        return fallback.data.id as string;
      }
    } else {
      throw new Error(`Failed to find user: ${findError.message}`);
    }
  }

  if (existing) {
    const tz = existing.timezone || DEFAULT_TIMEZONE;
    userTimezoneCache.set(telegramId, tz);
    return existing.id as string;
  }

  // User not found — create a new record
  const insertPayload: Record<string, unknown> = {
    telegram_id: telegramId,
    timezone,
  };

  let created: any = null;
  const insertRes = await supabase
    .from("users")
    .insert(insertPayload)
    .select("id")
    .single();

  if (insertRes.error && /timezone/i.test(insertRes.error.message)) {
    // Retry without timezone column if migration hasn't run yet
    delete insertPayload.timezone;
    const retry = await supabase
      .from("users")
      .insert(insertPayload)
      .select("id")
      .single();
    if (retry.error || !retry.data) {
      throw new Error(`Failed to create user: ${retry.error?.message}`);
    }
    created = retry.data;
  } else if (insertRes.error || !insertRes.data) {
    throw new Error(`Failed to create user: ${insertRes.error?.message}`);
  } else {
    created = insertRes.data;
  }

  userTimezoneCache.set(telegramId, timezone);
  return created.id as string;
}

/**
 * Retrieves the user's timezone from cache or database.
 * Defaults to Asia/Tashkent if unspecified or unknown.
 */
export async function getUserTimezone(telegramId: number): Promise<string> {
  const cached = userTimezoneCache.get(telegramId);
  if (cached) return cached;

  try {
    const { data, error } = await supabase
      .from("users")
      .select("timezone")
      .eq("telegram_id", telegramId)
      .maybeSingle();

    if (!error && data?.timezone && isValidTimeZone(data.timezone)) {
      userTimezoneCache.set(telegramId, data.timezone);
      return data.timezone;
    }
  } catch (err) {
    console.warn("[getUserTimezone] Failed to fetch timezone:", err);
  }

  userTimezoneCache.set(telegramId, DEFAULT_TIMEZONE);
  return DEFAULT_TIMEZONE;
}

/**
 * Updates the user's timezone in memory and database.
 */
export async function setUserTimezone(telegramId: number, timezone: string): Promise<void> {
  if (!isValidTimeZone(timezone)) {
    throw new Error(`Invalid timezone: ${timezone}`);
  }

  // Make sure user exists first
  await upsertUser(telegramId, timezone);

  userTimezoneCache.set(telegramId, timezone);

  const { error } = await supabase
    .from("users")
    .update({ timezone })
    .eq("telegram_id", telegramId);

  if (error) {
    console.warn("[setUserTimezone] Could not update timezone in DB (migration may be needed):", error.message);
  }
}

