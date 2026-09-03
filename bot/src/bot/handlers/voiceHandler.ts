import { Context, SessionFlavor } from "grammy";
import { SessionData } from "../session";
import { downloadTelegramFile } from "./mediaHandler";
import { parseVoiceNote, VoiceParseError } from "../../services/geminiService";
import { parsedToPending, logReminder } from "../../services/pendingReminder";
import { continueReminderCollection } from "./reminderFlow";
import { buildReminderTypeKeyboard } from "../keyboards";
import { DEFAULT_TIMEZONE, nowContext } from "../../utils/timezone";
import { getUserTimezone } from "../../services/userService";

type BotContext = Context & SessionFlavor<SessionData>;

function getVoiceMime(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase();
  if (ext === "wav") return "audio/wav";
  if (ext === "mp3") return "audio/mp3";
  return "audio/ogg";
}

export async function voiceHandler(ctx: BotContext): Promise<void> {
  const msg = ctx.message;
  if (!msg?.voice) return;

  const telegramId = ctx.from?.id;
  const userTz = telegramId ? await getUserTimezone(telegramId) : DEFAULT_TIMEZONE;

  const existing = ctx.session.pending;
  const mediaUrl = existing?.mediaUrl;
  const mediaType =
    existing?.mediaType && existing.mediaType !== "voice"
      ? existing.mediaType
      : existing?.mediaUrl
        ? existing.mediaType
        : "voice";
  const initialText = existing?.initialText;
  const capturedAt = existing?.capturedAt ?? new Date().toISOString();

  logReminder("Voice received");

  const processingMsg = await ctx.reply(
    "🎙️ Ovozli xabaringiz sun'iy intellekt yordamida tahlil qilinmoqda…"
  );

  try {
    const { buffer, filename } = await downloadTelegramFile(msg.voice.file_id);
    const mimeType = getVoiceMime(filename);
    const clock = nowContext(userTz);

    const parsed = await parseVoiceNote(buffer, mimeType, {
      date: clock.date,
      time: clock.time,
      timezone: userTz,
    });

    logReminder("Parsed:", {
      reminderType: parsed.reminderType,
      date: parsed.date,
      time: parsed.time,
      timezone: parsed.timezone,
      intervalMinutes: parsed.intervalMinutes,
      recurrenceText: parsed.recurrenceText,
      endDate: parsed.endDate,
      useUploadTime: parsed.useUploadTime,
      hasNote: Boolean(parsed.note),
    });

    const newReminder = parsedToPending(parsed);
    newReminder.timezone = newReminder.timezone || userTz;

    let mergedReminder = newReminder;
    if (existing?.reminder) {
      mergedReminder = {
        ...existing.reminder,
        note: newReminder.note ?? existing.reminder.note,
        reminderType: newReminder.reminderType ?? existing.reminder.reminderType,
        date: newReminder.date ?? existing.reminder.date,
        time: newReminder.time ?? existing.reminder.time,
        intervalMinutes: newReminder.intervalMinutes ?? existing.reminder.intervalMinutes,
        recurrenceText: newReminder.recurrenceText ?? existing.reminder.recurrenceText,
        endDate: newReminder.endDate ?? existing.reminder.endDate,
        useCapturedTime: newReminder.useCapturedTime || existing.reminder.useCapturedTime,
      };
    }

    ctx.session.pending = {
      step: existing?.step ?? "awaiting_missing_note",
      mediaType,
      mediaUrl,
      initialText,
      capturedAt,
      noteText: mergedReminder.note ?? existing?.noteText,
      reminder: mergedReminder,
    };

    await continueReminderCollection(ctx);
  } catch (err) {
    console.error("[voiceHandler] Error parsing voice note:", err);

    const isParseError = err instanceof VoiceParseError;
    const isMissingKey = isParseError && err.message.includes("GEMINI_API_KEY");

    const fallbackMsg = isMissingKey
      ? "⚠️ **Dasturchi uchun ogohlantirish:** `.env` faylida `GEMINI_API_KEY` kiritilmagan. Ovozli funksiyalar vaqtincha ishlamaydi.\n\nIltimos, ma'lumotlarni qo'lda kiriting:"
      : isParseError
        ? "🎙️ Ovozli xabaringizni eshitdim, ammo undan aniq ko'rsatmani ajratib ololmadim. Iltimos, qo'lda kiriting:"
        : "❌ Ovozli xabarni tahlil qilishda xatolik yuz berdi. Iltimos, qo'lda kiriting:";

    ctx.session.pending = {
      step: "awaiting_note",
      mediaType,
      mediaUrl,
      initialText,
      capturedAt,
    };

    await ctx.reply(fallbackMsg + "\n\nUshbu xotira uchun izoh yoki vazifani yozing:", {
      parse_mode: "Markdown",
      reply_markup: buildReminderTypeKeyboard(),
    });
  }

  try {
    await ctx.api.deleteMessage(ctx.chat!.id, processingMsg.message_id);
  } catch {
    // Non-fatal
  }
}
