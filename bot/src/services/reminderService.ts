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
  recurringIntervalMinutes: number | null = null
): Promise<void> {
  const { error } = await supabase.from("reminders").insert({
    memory_id: memoryId,
    scheduled_at: scheduledAt.toISOString(),
    is_recurring: isRecurring,
    recurring_interval_minutes: recurringIntervalMinutes,
    status: "pending",
  });

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
  const { data, error } = await supabase
    .from("reminders")
    .select(
      `
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
    `
    )
    .eq("status", "pending")
    .lte("scheduled_at", new Date().toISOString());

  if (error) {
    throw new Error(`Failed to fetch due reminders: ${error.message}`);
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
  }));
}

/**
 * Marks a reminder as sent. If recurring, calculates next scheduled_at and keeps it pending.
 * Skips processing if the reminder has been stopped.
 */
export async function processReminderSent(
  reminderId: string,
  isRecurring: boolean,
  recurringIntervalMinutes: number | null
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
      memories (
        id,
        content_text,
        media_type,
        media_url,
        users (
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
  return data.map((row: any) => ({
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
 */
export async function stopReminder(reminderId: string): Promise<void> {
  console.log("[stopReminder] Attempting to stop reminder:", reminderId);
  
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
