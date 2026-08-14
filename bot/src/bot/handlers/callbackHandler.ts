import { CallbackQueryContext, Context, SessionFlavor } from "grammy";
import { SessionData } from "../session";
import { upsertUser } from "../../services/userService";
import { createMemory } from "../../services/memoryService";
import { createReminder, stopReminder } from "../../services/reminderService";
import { buildOneTimeKeyboard, buildReminderTypeKeyboard } from "../keyboards";
import { parseCustomDate, parseCycleInterval } from "../../utils/dateParser";

// ----------------------------------------------------------------
// Callback Handler
// Handles Steps 3 & 4: Button presses for Reminder Type and Dates.
// Also handles stop cycle callbacks.
// ----------------------------------------------------------------

type BotContext = Context & SessionFlavor<SessionData>;

/**
 * Formats a Date into a readable string (UTC).
 */
export function formatDate(date: Date): string {
  return date.toLocaleString("en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    hour12: false,
  }) + " UTC";
}

/**
 * Core save function: writes memory + reminder to Supabase.
 */
export async function saveMemoryAndReminder(
  telegramId: number,
  session: SessionData,
  scheduledAt: Date,
  isRecurring: boolean,
  recurringIntervalMinutes: number | null
): Promise<void> {
  const pending = session.pending!;

  const userId = await upsertUser(telegramId);

  const memory = await createMemory({
    userId,
    mediaType: pending.mediaType,
    mediaUrl: pending.mediaUrl,
    contentText: pending.noteText ?? pending.initialText,
  });

  await createReminder(
    memory.id,
    scheduledAt,
    isRecurring,
    recurringIntervalMinutes
  );
}

/**
 * Send the final summary card.
 */
export async function sendSummaryCard(
  ctx: BotContext,
  noteText: string | undefined,
  typeText: string,
  scheduledAt: Date
): Promise<void> {
  const note = noteText ? `\n📌 **Note:** ${noteText}` : "";
  await ctx.reply(
    `✅ **Memory Saved Successfully!**${note}\n🗓️ **Type:** ${typeText}\n⏰ **Next Reminder:** ${formatDate(scheduledAt)}`,
    { parse_mode: "Markdown" }
  );
}

/**
 * Main callback handler for schedule button presses.
 */
export async function scheduleCallbackHandler(
  ctx: CallbackQueryContext<BotContext>
): Promise<void> {
  const data = ctx.callbackQuery.data;
  await ctx.answerCallbackQuery(); // Remove the loading spinner

  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const pending = ctx.session.pending;
  if (!pending) {
    await ctx.reply("⚠️ Session expired. Please send your content again.");
    return;
  }

  // --- Voice Confirm / Edit ---
  if (pending.step === "awaiting_voice_confirm") {
    if (data === "voice_confirm") {
      const scheduledAt = pending.voiceScheduledAt
        ? new Date(pending.voiceScheduledAt)
        : null;

      if (!scheduledAt) {
        await ctx.reply("⚠️ Session data is incomplete. Please send your voice note again.");
        ctx.session.pending = undefined;
        return;
      }

      try {
        await saveMemoryAndReminder(
          telegramId,
          ctx.session,
          scheduledAt,
          pending.voiceIsRecurring ?? false,
          pending.voiceIntervalMinutes ?? null
        );
        const noteText = pending.voiceParsedNote;
        ctx.session.pending = undefined;
        const typeText = pending.voiceIsRecurring ? "Cycle (Repeating)" : "One-Time";
        await sendSummaryCard(ctx, noteText, typeText, scheduledAt);
      } catch (err) {
        console.error("[scheduleCallbackHandler] voice_confirm error:", err);
        await ctx.reply("❌ Something went wrong saving your memory. Please try again.");
      }
      return;
    }

    if (data === "voice_edit") {
      // Keep the parsed note text, fall back to manual reminder type selection
      ctx.session.pending = {
        ...pending,
        step: "awaiting_reminder_type",
        noteText: pending.voiceParsedNote ?? pending.noteText,
      };
      await ctx.reply("How would you like to receive reminders?", {
        reply_markup: buildReminderTypeKeyboard(),
      });
      return;
    }
    return; // Ignore unknown callbacks while in voice_confirm step
  }

  // --- Step 3: Choose Reminder Type ---
  if (pending.step === "awaiting_reminder_type") {
    if (data === "type_onetime") {
      ctx.session.pending = { ...pending, step: "awaiting_one_time_date", reminderType: "onetime" };
      await ctx.reply("When should I remind you once?", {
        reply_markup: buildOneTimeKeyboard(),
      });
      return;
    }

    if (data === "type_cycle") {
      ctx.session.pending = { ...pending, step: "awaiting_cycle_interval", reminderType: "cycle" };
      await ctx.reply("How often should this cycle? Enter an interval (e.g., 'every 2 hours', 'every 5 minutes', or 'every 1 day').");
      return;
    }
    return; // Ignore other buttons
  }

  // --- Step 4: One-Time Date Selection ---
  if (pending.step === "awaiting_one_time_date") {
    if (data === "remind_custom") {
      // Stay in awaiting_one_time_date, but we are now expecting text
      await ctx.reply("Please enter a date in format `DD/MM/YYYY` (or `DD/MM/YYYY HH:MM` for specific time).", {
        parse_mode: "Markdown"
      });
      return;
    }

    let addMinutes = 0;
    if (data === "remind_1d") addMinutes = 1440;
    else if (data === "remind_3d") addMinutes = 4320;
    else if (data === "remind_5d") addMinutes = 7200;
    else return; // Ignore unknown callback

    const scheduledAt = new Date(Date.now() + addMinutes * 60 * 1000);

    try {
      await saveMemoryAndReminder(telegramId, ctx.session, scheduledAt, false, null);
      const noteText = pending.noteText;
      ctx.session.pending = undefined; // Clear session
      await sendSummaryCard(ctx, noteText, "One-Time", scheduledAt);
    } catch (err) {
      console.error("[scheduleCallbackHandler] Error saving to DB:", err);
      await ctx.reply("❌ Something went wrong saving your reminder. Please try again.");
    }
  }
}

/**
 * Handles text input for Custom Dates and Cycle Intervals (Step 4).
 * Returns true if the message was consumed.
 */
export async function textInputHandler(ctx: BotContext): Promise<boolean> {
  const pending = ctx.session.pending;
  if (!pending) return false;

  const text = ctx.message?.text?.trim();
  if (!text) return false;

  const telegramId = ctx.from?.id;
  if (!telegramId) return false;

  // --- Custom One-Time Date ---
  if (pending.step === "awaiting_one_time_date") {
    const scheduledAt = parseCustomDate(text);
    if (!scheduledAt) {
      await ctx.reply("❌ Invalid date format or date is in the past. Please use `DD/MM/YYYY` or `DD/MM/YYYY HH:MM`.", { parse_mode: "Markdown" });
      return true;
    }

    try {
      await saveMemoryAndReminder(telegramId, ctx.session, scheduledAt, false, null);
      const noteText = pending.noteText;
      ctx.session.pending = undefined;
      await sendSummaryCard(ctx, noteText, "One-Time", scheduledAt);
    } catch (err) {
      console.error("[textInputHandler] Error saving custom date:", err);
      await ctx.reply("❌ Something went wrong saving your reminder. Please try again.");
    }
    return true;
  }

  // --- Cycle Interval ---
  if (pending.step === "awaiting_cycle_interval") {
    const intervalMinutes = parseCycleInterval(text);
    if (!intervalMinutes) {
      await ctx.reply("❌ I didn't understand that interval. Try something like 'every 2 hours', 'every 3 days', or 'every 5 minutes'.");
      return true;
    }

    const scheduledAt = new Date(Date.now() + intervalMinutes * 60 * 1000);

    try {
      await saveMemoryAndReminder(telegramId, ctx.session, scheduledAt, true, intervalMinutes);
      const noteText = pending.noteText;
      ctx.session.pending = undefined;
      await sendSummaryCard(ctx, noteText, "Cycle (Repeating)", scheduledAt);
    } catch (err) {
      console.error("[textInputHandler] Error saving cycle interval:", err);
      await ctx.reply("❌ Something went wrong saving your reminder. Please try again.");
    }
    return true;
  }

  return false;
}

/**
 * Handles callback queries for stopping cycles.
 * Callback data format: "stop_{reminder_id}"
 */
export async function stopCycleCallbackHandler(
  ctx: CallbackQueryContext<BotContext>
): Promise<void> {
  const data = ctx.callbackQuery.data;
  console.log("[stopCycleCallbackHandler] Callback data:", data);
  await ctx.answerCallbackQuery(); // Remove the loading spinner

  if (!data?.startsWith("stop_")) {
    console.log("[stopCycleCallbackHandler] Invalid callback data format");
    return;
  }

  const reminderId = data.replace("stop_", "");
  console.log("[stopCycleCallbackHandler] Stopping reminder:", reminderId);

  try {
    await stopReminder(reminderId);
    console.log("[stopCycleCallbackHandler] Successfully stopped reminder:", reminderId);
    await ctx.reply("✅ Cycle stopped successfully. You won't receive further reminders for this memory.");
  } catch (err) {
    console.error("[stopCycleCallbackHandler] Error:", err);
    await ctx.reply("❌ Something went wrong stopping the cycle. Please try again.");
  }
}
