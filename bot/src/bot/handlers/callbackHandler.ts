import { CallbackQueryContext, Context, SessionFlavor } from "grammy";
import { SessionData } from "../session";
import { upsertUser } from "../../services/userService";
import { createMemory } from "../../services/memoryService";
import { createReminder, stopReminder } from "../../services/reminderService";
import { buildOneTimeKeyboard } from "../keyboards";
import { parseCustomDate, parseCycleInterval } from "../../utils/dateParser";
import { handleReminderCallback, handleReminderText } from "./reminderFlow";

import { getUserTimezone, setUserTimezone } from "../../services/userService";
import { formatZoned, formatZonedWithTz, DEFAULT_TIMEZONE, isValidTimeZone } from "../../utils/timezone";

type BotContext = Context & SessionFlavor<SessionData>;

export function formatDate(date: Date, timeZone: string = DEFAULT_TIMEZONE): string {
  return formatZonedWithTz(date, timeZone);
}

export async function saveMemoryAndReminder(
  telegramId: number,
  session: SessionData,
  scheduledAt: Date,
  isRecurring: boolean,
  recurringIntervalMinutes: number | null
): Promise<void> {
  const pending = session.pending!;

  const userId = await upsertUser(telegramId);

  let finalContentText = pending.initialText ?? "";
  if (pending.noteText) {
    if (finalContentText) {
      finalContentText += `\n\n📌 **Note:** ${pending.noteText}`;
    } else {
      finalContentText = pending.noteText;
    }
  }

  const memory = await createMemory({
    userId,
    mediaType: pending.mediaType === "voice" ? "text" : pending.mediaType,
    mediaUrl: pending.mediaUrl,
    contentText: finalContentText || undefined,
  });

  await createReminder(
    memory.id,
    scheduledAt,
    isRecurring,
    recurringIntervalMinutes
  );
}

/**
 * Send the final summary card with user's timezone.
 */
export async function sendSummaryCard(
  ctx: BotContext,
  noteText: string | undefined,
  typeText: string,
  scheduledAt: Date,
  timeZone: string = DEFAULT_TIMEZONE
): Promise<void> {
  const note = noteText ? `\n📌 **Izoh:** ${noteText}` : "";
  await ctx.reply(
    `✅ **Eslatma muvaffaqiyatli saqlandi!**${note}\n🗓️ **Turi:** ${typeText}\n⏰ **Keyingi eslatma:** ${formatDate(scheduledAt, timeZone)}`,
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
    await ctx.reply("⚠️ Sessiya muddati tugadi. Iltimos, xabaringizni qaytadan yuboring.");
    return;
  }

  if (await handleReminderCallback(ctx)) return;

  // --- Step 3: Choose Reminder Type ---
  if (pending.step === "awaiting_reminder_type") {
    if (data === "type_onetime") {
      ctx.session.pending = { ...pending, step: "awaiting_one_time_date", reminderType: "onetime" };
      await ctx.reply("Sizga qachon bir martalik eslatma yuboray?", {
        reply_markup: buildOneTimeKeyboard(),
      });
      return;
    }

    if (data === "type_cycle") {
      ctx.session.pending = { ...pending, step: "awaiting_cycle_interval", reminderType: "cycle" };
      await ctx.reply("Qanchalik tez-tez takrorlansin? Oraliqni kiriting (masalan: 'har 2 soatda', 'har 5 daqiqada' yoki 'har 1 kunda').");
      return;
    }
    return; // Ignore other buttons
  }

  // --- Step 4: One-Time Date Selection ---
  if (pending.step === "awaiting_one_time_date") {
    if (data === "remind_custom") {
      // Stay in awaiting_one_time_date, but we are now expecting text
      await ctx.reply("Iltimos, sanani `KK/OO/YYYY` (yoki vaqt bilan birga `KK/OO/YYYY SS:DD`) formatida kiriting.", {
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
      const userTz = await getUserTimezone(telegramId);
      await saveMemoryAndReminder(telegramId, ctx.session, scheduledAt, false, null);
      const noteText = pending.noteText;
      ctx.session.pending = undefined; // Clear session
      await sendSummaryCard(ctx, noteText, "Bir martalik", scheduledAt, userTz);
    } catch (err) {
      console.error("[scheduleCallbackHandler] Error saving to DB:", err);
      await ctx.reply("❌ Eslatmani saqlashda xatolik yuz berdi. Iltimos, qaytadan urinib ko'ring.");
    }
  }
}

/**
 * Handles text input for Custom Dates and Cycle Intervals (Step 4).
 * Returns true if the message was consumed.
 */
export async function textInputHandler(ctx: BotContext): Promise<boolean> {
  const pending = ctx.session.pending;
  const text = ctx.message?.text?.trim();
  const telegramId = ctx.from?.id;

  if (!telegramId || !text) return false;

  // Check if user is typing a manual timezone (e.g. "Asia/Tashkent" or "Europe/Moscow")
  if (!pending && isValidTimeZone(text)) {
    try {
      await setUserTimezone(telegramId, text);
      const nowStr = formatZoned(new Date(), text);
      await ctx.reply(
        `✅ Vaqt mintaqangiz muvaffaqiyatli saqlandi: \`${text}\`\nHozirgi mahalliy vaqtingiz: *${nowStr}*`,
        { parse_mode: "Markdown" }
      );
      return true;
    } catch (err) {
      console.error("[textInputHandler] Error updating timezone:", err);
    }
  }

  if (!pending) return false;

  if (await handleReminderText(ctx)) return true;

  const userTz = await getUserTimezone(telegramId);

  // --- Custom One-Time Date ---
  if (pending.step === "awaiting_one_time_date") {
    const scheduledAt = parseCustomDate(text, userTz);
    if (!scheduledAt) {
      await ctx.reply("❌ Noto'g'ri sana formati yoki o'tib ketgan sana kiritildi. Iltimos, `KK/OO/YYYY` yoki `KK/OO/YYYY SS:DD` formatida kiriting.", { parse_mode: "Markdown" });
      return true;
    }

    try {
      await saveMemoryAndReminder(telegramId, ctx.session, scheduledAt, false, null);
      const noteText = pending.noteText;
      ctx.session.pending = undefined;
      await sendSummaryCard(ctx, noteText, "Bir martalik", scheduledAt, userTz);
    } catch (err) {
      console.error("[textInputHandler] Error saving custom date:", err);
      await ctx.reply("❌ Eslatmani saqlashda xatolik yuz berdi. Iltimos, qaytadan urinib ko'ring.");
    }
    return true;
  }

  // --- Cycle Interval ---
  if (pending.step === "awaiting_cycle_interval") {
    const intervalMinutes = parseCycleInterval(text);
    if (!intervalMinutes) {
      await ctx.reply("❌ Bu oraliqni tushunmadim. Masalan: 'har 2 soatda', 'har 3 kunda' yoki 'har 5 daqiqada' deb yozing.");
      return true;
    }

    const scheduledAt = new Date(Date.now() + intervalMinutes * 60 * 1000);

    try {
      await saveMemoryAndReminder(telegramId, ctx.session, scheduledAt, true, intervalMinutes);
      const noteText = pending.noteText;
      ctx.session.pending = undefined;
      await sendSummaryCard(ctx, noteText, "Davriy (takrorlanuvchi)", scheduledAt, userTz);
    } catch (err) {
      console.error("[textInputHandler] Error saving cycle interval:", err);
      await ctx.reply("❌ Oraliqni saqlashda xatolik yuz berdi. Iltimos, qaytadan urinib ko'ring.");
    }
    return true;
  }

  return false;
}

/**
 * Handles timezone button callback selections.
 * Callback data format: "tz_{timeZone}"
 */
export async function timezoneCallbackHandler(
  ctx: CallbackQueryContext<BotContext>
): Promise<void> {
  const data = ctx.callbackQuery.data;
  await ctx.answerCallbackQuery();

  const telegramId = ctx.from?.id;
  if (!telegramId || !data?.startsWith("tz_")) return;

  const newTz = data.replace("tz_", "");
  try {
    await setUserTimezone(telegramId, newTz);
    const nowStr = formatZoned(new Date(), newTz);
    await ctx.reply(
      `✅ Vaqt mintaqangiz muvaffaqiyatli saqlandi: \`${newTz}\`\nHozirgi mahalliy vaqtingiz: *${nowStr}*`,
      { parse_mode: "Markdown" }
    );
  } catch (err) {
    console.error("[timezoneCallbackHandler] Error saving timezone:", err);
    await ctx.reply("❌ Vaqt mintaqasini saqlashda xatolik yuz berdi.");
  }
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
  const telegramId = ctx.from?.id;
  console.log("[stopCycleCallbackHandler] Stopping reminder:", reminderId, "by user:", telegramId);

  try {
    await stopReminder(reminderId, telegramId);
    console.log("[stopCycleCallbackHandler] Successfully stopped reminder:", reminderId);
    await ctx.reply("✅ Eslatma muvaffaqiyatli to'xtatildi. Ushbu xotira bo'yicha boshqa eslatmalar olmaysiz.");
  } catch (err: any) {
    console.error("[stopCycleCallbackHandler] Error:", err);
    await ctx.reply(err.message || "❌ Eslatmani to'xtatishda xatolik yuz berdi. Iltimos, qaytadan urinib ko'ring.");
  }
}
