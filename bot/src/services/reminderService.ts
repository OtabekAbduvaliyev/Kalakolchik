import { supabase } from "../db/supabase";

// ----------------------------------------------------------------
// Reminder Service
// Handles creating reminders and fetching due reminders for
// the background scheduler.
// ----------------------------------------------------------------

export interface DueReminder {
  reminder_id: string;
  memory_id: string;
  media_type: string;
  media_url: string | null;
  content_text: string | null;
  telegram_id: number;
  is_recurring: boolean;
  recurring_interval_minutes: number | null;
  end_date: string | null;
}

export interface ActiveCycle {
  reminder_id: string;
  memory_id: string;
  content_text: string | null;
  media_type: string;
  scheduled_at: string;
  recurring_interval_minutes: number | null;
}

/**
 * Creates a reminder for a given memory at a specific timestamp.
 */
export async function createReminder(
  memoryId: string,
  scheduledAt: Date,
  isRecurring: boolean = false,
  recurringIntervalMinutes: number | null = null,
  endDate: string | null = null
): Promise<void> {
  const payload: Record<string, unknown> = {
    memory_id: memoryId,
    scheduled_at: scheduledAt.toISOString(),
    is_recurring: isRecurring,
    recurring_interval_minutes: recurringIntervalMinutes,
    status: "pending",
  };

  if (endDate) payload.end_date = endDate;

  const { error } = await supabase.from("reminders").insert(payload);

  if (error && endDate && /end_date/i.test(error.message)) {
    delete payload.end_date;
    const retry = await supabase.from("reminders").insert(payload);
    if (retry.error) {
      throw new Error(`Failed to create reminder: ${retry.error.message}`);
    }
    console.warn("[createReminder] end_date column missing; reminder saved without end date.");
    return;
  }

  if (error) {
    throw new Error(`Failed to create reminder: ${error.message}`);
  }
}

/**
 * Fetches all pending reminders whose scheduled_at time has passed.
 * Joins memories and users to get all data needed to send the message.
 * Excludes stopped reminders.
 */
export async function getDueReminders(): Promise<DueReminder[]> {
  const baseColumns = `
      id,
      memory_id,
      is_recurring,
      recurring_interval_minutes,
      memories (
        media_type,
        media_url,
        content_text,
        users (
          telegram_id
        )
      )
    `;

  // Try with end_date first; if the column doesn't exist yet, retry without it
  let data: any[] | null = null;
  let hasEndDate = true;

  const first = await supabase
    .from("reminders")
    .select(baseColumns.replace("recurring_interval_minutes,", "recurring_interval_minutes,\n      end_date,"))
    .eq("status", "pending")
    .lte("scheduled_at", new Date().toISOString());

  if (first.error && /end_date/i.test(first.error.message)) {
    hasEndDate = false;
    console.warn("[getDueReminders] end_date column not found; querying without it. Run migration_add_end_date.sql to enable end-date enforcement.");
    const fallback = await supabase
      .from("reminders")
      .select(baseColumns)
      .eq("status", "pending")
      .lte("scheduled_at", new Date().toISOString());

    if (fallback.error) {
      throw new Error(`Failed to fetch due reminders: ${fallback.error.message}`);
    }
    data = fallback.data;
  } else if (first.error) {
    throw new Error(`Failed to fetch due reminders: ${first.error.message}`);
  } else {
    data = first.data;
  }

  if (!data) return [];

  // Flatten the nested join result into a flat structure
  return data.map((row: any) => ({
    reminder_id: row.id,
    memory_id: row.memory_id,
    media_type: row.memories.media_type,
    media_url: row.memories.media_url,
    content_text: row.memories.content_text,
    telegram_id: row.memories.users.telegram_id,
    is_recurring: row.is_recurring,
    recurring_interval_minutes: row.recurring_interval_minutes,
    end_date: hasEndDate ? (row.end_date ?? null) : null,
  }));
}

/**
 * Marks a reminder as sent. If recurring, calculates next scheduled_at and keeps it pending.
 * Skips processing if the reminder has been stopped.
 */
export async function processReminderSent(
  reminderId: string,
  isRecurring: boolean,
  recurringIntervalMinutes: number | null,
  endDate: string | null = null
): Promise<void> {
  // First check if the reminder has been stopped
  const { data: reminderData } = await supabase
    .from("reminders")
    .select("status")
    .eq("id", reminderId)
    .single();

  if (reminderData?.status === "stopped") {
    console.log(`[processReminderSent] Reminder ${reminderId} is stopped, skipping.`);
    return;
  }

  if (isRecurring && recurringIntervalMinutes) {
    const nextDate = new Date(Date.now() + recurringIntervalMinutes * 60 * 1000);

    // Enforce end_date: if the next occurrence is past the deadline, stop the cycle
    if (endDate) {
      const endLimit = new Date(endDate);
      if (nextDate > endLimit) {
        console.log(`[processReminderSent] Reminder ${reminderId} has passed its end date, marking as stopped.`);
        const { error } = await supabase
          .from("reminders")
          .update({ status: "stopped" })
          .eq("id", reminderId);
        if (error) {
          throw new Error(`Failed to stop expired recurring reminder: ${error.message}`);
        }
        return;
      }
    }

    const { error } = await supabase
      .from("reminders")
      .update({ scheduled_at: nextDate.toISOString() })
      .eq("id", reminderId);

    if (error) {
      throw new Error(`Failed to update recurring reminder: ${error.message}`);
    }
  } else {
    const { error } = await supabase
      .from("reminders")
      .update({ status: "sent" })
      .eq("id", reminderId);

    if (error) {
      throw new Error(`Failed to mark reminder as sent: ${error.message}`);
    }
  }
}

/**
 * Fetches all active recurring reminders for a specific user.
 * Returns reminders with memory details for display.
 */
export async function getActiveCyclesForUser(telegramId: number): Promise<ActiveCycle[]> {
  const { data, error } = await supabase
    .from("reminders")
    .select(
      `
      id,
      scheduled_at,
      recurring_interval_minutes,
      memories!inner (
        id,
        content_text,
        media_type,
        media_url,
        users!inner (
          telegram_id
        )
      )
    `
    )
    .eq("is_recurring", true)
    .eq("status", "pending")
    .eq("memories.users.telegram_id", telegramId);

  if (error) {
    throw new Error(`Failed to fetch active cycles: ${error.message}`);
  }

  if (!data) return [];

  // Flatten the nested join result into a flat structure
  return data
    .filter((row: any) => row.memories && row.memories.users)
    .map((row: any) => ({
      reminder_id: row.id,
      memory_id: row.memories.id,
      content_text: row.memories.content_text,
      media_type: row.memories.media_type,
      scheduled_at: row.scheduled_at,
      recurring_interval_minutes: row.recurring_interval_minutes,
    }));
}

/**
 * Stops a recurring reminder by setting its status to 'stopped'.
 * Optionally verifies that the reminder belongs to telegramId.
 */
export async function stopReminder(reminderId: string, telegramId?: number): Promise<void> {
  console.log("[stopReminder] Attempting to stop reminder:", reminderId, "by user:", telegramId);

  if (telegramId) {
    // Verify ownership so a user cannot stop another user's reminder
    const { data: reminder, error: checkError } = await supabase
      .from("reminders")
      .select(
        `
        id,
        memories!inner (
          users!inner (
            telegram_id
          )
        )
      `
      )
      .eq("id", reminderId)
      .eq("memories.users.telegram_id", telegramId)
      .maybeSingle();

    if (checkError) {
      console.error("[stopReminder] Ownership check error:", checkError);
      throw new Error(`Xatolik yuz berdi: ${checkError.message}`);
    }

    if (!reminder) {
      console.warn(`[stopReminder] Unauthorized attempt to stop reminder ${reminderId} by user ${telegramId}`);
      throw new Error("Ushbu eslatma sizga tegishli emas yoki topilmadi.");
    }
  }

  const { error, data } = await supabase
    .from("reminders")
    .update({ status: "stopped" })
    .eq("id", reminderId)
    .select();

  if (error) {
    console.error("[stopReminder] Database error:", error);
    throw new Error(`Failed to stop reminder: ${error.message}`);
  }

  console.log("[stopReminder] Update result:", data);
}

export interface UserReminderItem {
  reminder_id: string;
  memory_id: string;
  content_text: string | null;
  media_type: string;
  media_url: string | null;
  scheduled_at: string;
  is_recurring: boolean;
  recurring_interval_minutes: number | null;
  end_date: string | null;
}

/**
 * Fetches all pending reminders (one-time and recurring) for a user,
 * ordered by scheduled_at ascending.
 */
export async function getUserReminders(telegramId: number): Promise<UserReminderItem[]> {
  const { data, error } = await supabase
    .from("reminders")
    .select(
      `
      id,
      scheduled_at,
      is_recurring,
      recurring_interval_minutes,
      end_date,
      memories!inner (
        id,
        content_text,
        media_type,
        media_url,
        users!inner (
          telegram_id
        )
      )
    `
    )
    .eq("status", "pending")
    .eq("memories.users.telegram_id", telegramId)
    .order("scheduled_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch user reminders: ${error.message}`);
  }

  if (!data) return [];

  return data
    .filter((row: any) => row.memories && row.memories.users)
    .map((row: any) => ({
      reminder_id: row.id,
      memory_id: row.memories.id,
      content_text: row.memories.content_text,
      media_type: row.memories.media_type,
      media_url: row.memories.media_url,
      scheduled_at: row.scheduled_at,
      is_recurring: row.is_recurring,
      recurring_interval_minutes: row.recurring_interval_minutes,
      end_date: row.end_date ?? null,
    }));
}

