import { CallbackQueryContext, Context, SessionFlavor } from "grammy";
import { SessionData } from "../session";
import { upsertUser } from "../../services/userService";
import { createMemory } from "../../services/memoryService";
import { createReminder, stopReminder } from "../../services/reminderService";
import { buildOneTimeKeyboard } from "../keyboards";
import { parseCustomDate, parseCycleInterval } from "../../utils/dateParser";
import { handleReminderCallback, handleReminderText } from "./reminderFlow";

type BotContext = Context & SessionFlavor<SessionData>;

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
 * Send the final summary card.
 */
export async function sendSummaryCard(
  ctx: BotContext,
  noteText: string | undefined,
  typeText: string,
  scheduledAt: Date
): Promise<void> {
  const note = noteText ? `\n📌 **Izoh:** ${noteText}` : "";
  await ctx.reply(
    `✅ **Eslatma muvaffaqiyatli saqlandi!**${note}\n🗓️ **Turi:** ${typeText}\n⏰ **Keyingi eslatma:** ${formatDate(scheduledAt)}`,
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
      await saveMemoryAndReminder(telegramId, ctx.session, scheduledAt, false, null);
      const noteText = pending.noteText;
      ctx.session.pending = undefined; // Clear session
      await sendSummaryCard(ctx, noteText, "Bir martalik", scheduledAt);
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
  if (!pending) return false;

  const text = ctx.message?.text?.trim();
  if (!text) return false;

  const telegramId = ctx.from?.id;
  if (!telegramId) return false;

  if (await handleReminderText(ctx)) return true;

  // --- Custom One-Time Date ---
  if (pending.step === "awaiting_one_time_date") {
    const scheduledAt = parseCustomDate(text);
    if (!scheduledAt) {
      await ctx.reply("❌ Noto'g'ri sana formati yoki o'tib ketgan sana kiritildi. Iltimos, `KK/OO/YYYY` yoki `KK/OO/YYYY SS:DD` formatida kiriting.", { parse_mode: "Markdown" });
      return true;
    }

    try {
      await saveMemoryAndReminder(telegramId, ctx.session, scheduledAt, false, null);
      const noteText = pending.noteText;
      ctx.session.pending = undefined;
      await sendSummaryCard(ctx, noteText, "Bir martalik", scheduledAt);
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
      await sendSummaryCard(ctx, noteText, "Davriy (takrorlanuvchi)", scheduledAt);
    } catch (err) {
      console.error("[textInputHandler] Error saving cycle interval:", err);
      await ctx.reply("❌ Oraliqni saqlashda xatolik yuz berdi. Iltimos, qaytadan urinib ko'ring.");
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
    await ctx.reply("✅ Eslatma muvaffaqiyatli to'xtatildi. Ushbu xotira bo'yicha boshqa eslatmalar olmaysiz.");
  } catch (err) {
    console.error("[stopCycleCallbackHandler] Error:", err);
    await ctx.reply("❌ Eslatmani to'xtatishda xatolik yuz berdi. Iltimos, qaytadan urinib ko'ring.");
  }
}
