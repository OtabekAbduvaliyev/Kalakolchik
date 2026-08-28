"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.voiceHandler = voiceHandler;
const mediaHandler_1 = require("./mediaHandler");
const geminiService_1 = require("../../services/geminiService");
const pendingReminder_1 = require("../../services/pendingReminder");
const reminderFlow_1 = require("./reminderFlow");
const keyboards_1 = require("../keyboards");
const timezone_1 = require("../../utils/timezone");
function getVoiceMime(filePath) {
    const ext = filePath.split(".").pop()?.toLowerCase();
    if (ext === "wav")
        return "audio/wav";
    if (ext === "mp3")
        return "audio/mp3";
    return "audio/ogg";
}
async function voiceHandler(ctx) {
    const msg = ctx.message;
    if (!msg?.voice)
        return;
    const existing = ctx.session.pending;
    const mediaUrl = existing?.mediaUrl;
    const mediaType = existing?.mediaType && existing.mediaType !== "voice"
        ? existing.mediaType
        : existing?.mediaUrl
            ? existing.mediaType
            : "voice";
    const initialText = existing?.initialText;
    const capturedAt = existing?.capturedAt ?? new Date().toISOString();
    (0, pendingReminder_1.logReminder)("Voice received");
    const processingMsg = await ctx.reply("🎙️ Ovozli xabaringiz sun'iy intellekt yordamida tahlil qilinmoqda…");
    try {
        const { buffer, filename } = await (0, mediaHandler_1.downloadTelegramFile)(msg.voice.file_id);
        const mimeType = getVoiceMime(filename);
        const clock = (0, timezone_1.nowContext)(timezone_1.DEFAULT_TIMEZONE);
        const parsed = await (0, geminiService_1.parseVoiceNote)(buffer, mimeType, {
            date: clock.date,
            time: clock.time,
            timezone: timezone_1.DEFAULT_TIMEZONE,
        });
        (0, pendingReminder_1.logReminder)("Parsed:", {
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
        const newReminder = (0, pendingReminder_1.parsedToPending)(parsed);
        newReminder.timezone = newReminder.timezone || timezone_1.DEFAULT_TIMEZONE;
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
        await (0, reminderFlow_1.continueReminderCollection)(ctx);
    }
    catch (err) {
        console.error("[voiceHandler] Error parsing voice note:", err);
        const isParseError = err instanceof geminiService_1.VoiceParseError;
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
            reply_markup: (0, keyboards_1.buildReminderTypeKeyboard)(),
        });
    }
    try {
        await ctx.api.deleteMessage(ctx.chat.id, processingMsg.message_id);
    }
    catch {
        // Non-fatal
    }
}
