import { Context, SessionFlavor } from "grammy";
import { SessionData } from "../session";
import { downloadTelegramFile } from "./mediaHandler";
import { parseVoiceNote, VoiceParseError } from "../../services/geminiService";
import { parseCycleInterval, parseCustomDate } from "../../utils/dateParser";
import { buildReminderTypeKeyboard, buildVoiceConfirmKeyboard } from "../keyboards";
import { formatDate } from "./callbackHandler";

// ----------------------------------------------------------------
// Voice Handler (Gemini Flash Pro Feature)
// Receives a Telegram voice note, sends it to Gemini Flash for
// NLP parsing, and presents a confirmation card to the user.
// ----------------------------------------------------------------

type BotContext = Context & SessionFlavor<SessionData>;

/**
 * Determines the MIME type from the Telegram voice file path extension.
 * Telegram voice notes are .oga (ogg/opus), but sometimes .ogg or .wav.
 */
function getVoiceMime(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase();
  if (ext === "wav") return "audio/wav";
  if (ext === "mp3") return "audio/mp3";
  // Default for Telegram voice notes (.oga / .ogg)
  return "audio/ogg";
}

/**
 * Tries to calculate a scheduledAt date and interval from Gemini's interval_details.
 * Returns { scheduledAt, isRecurring, intervalMinutes } or null on failure.
 */
function resolveSchedule(
  type: "one_time" | "recurring",
  intervalDetails: string
): { scheduledAt: Date; isRecurring: boolean; intervalMinutes: number | null } | null {
  if (type === "recurring") {
    const minutes = parseCycleInterval(intervalDetails);
    if (!minutes) return null;
    const scheduledAt = new Date(Date.now() + minutes * 60 * 1000);
    return { scheduledAt, isRecurring: true, intervalMinutes: minutes };
  }

  // one_time — try DD/MM/YYYY format first
  const customDate = parseCustomDate(intervalDetails);
  if (customDate) {
    return { scheduledAt: customDate, isRecurring: false, intervalMinutes: null };
  }

  // Try "in X days" shorthand
  const inDaysMatch = intervalDetails.match(/in\s+(\d+)\s+day/i);
  if (inDaysMatch) {
    const days = parseInt(inDaysMatch[1], 10);
    const scheduledAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    return { scheduledAt, isRecurring: false, intervalMinutes: null };
  }

  return null;
}

/**
 * Main voice note handler.
 * Processes Telegram voice messages using Gemini Flash.
 */
export async function voiceHandler(ctx: BotContext): Promise<void> {
  const msg = ctx.message;
  if (!msg?.voice) return;

  // Preserve existing media (photo/video) if they send a voice note at Step 2
  const existingPending = ctx.session.pending;
  const existingMediaUrl = existingPending?.step === "awaiting_note" ? existingPending.mediaUrl : undefined;
  const existingMediaType = existingPending?.step === "awaiting_note" ? existingPending.mediaType : undefined;

  // Clear session to prevent state conflicts, but we will carry over the media
  ctx.session.pending = undefined;

  const processingMsg = await ctx.reply(
    "🎙️ Processing your voice note with AI… This takes a moment."
  );

  try {
    // --- Download voice file from Telegram ---
    // downloadTelegramFile already resolves the file path and returns the filename
    const { buffer, filename } = await downloadTelegramFile(msg.voice.file_id);
    const mimeType = getVoiceMime(filename);


    // --- Send to Gemini Flash ---
    const parsed = await parseVoiceNote(buffer, mimeType);

    // --- Resolve schedule from Gemini output ---
    const schedule = resolveSchedule(parsed.type, parsed.interval_details);

    if (!schedule) {
      // Gemini parsed a note but couldn't resolve the schedule — fall back gracefully
      await ctx.reply(
        `🎙️ Got your note!\n\n` +
        `📌 **Note:** ${parsed.note}\n\n` +
        `⚠️ I couldn't calculate a schedule from _"${parsed.interval_details}"_. ` +
        `Please select a reminder type manually:`,
        {
          parse_mode: "Markdown",
          reply_markup: buildReminderTypeKeyboard(),
        }
      );
      ctx.session.pending = {
        step: "awaiting_reminder_type",
        mediaType: existingMediaType ?? "voice",
        mediaUrl: existingMediaUrl,
        noteText: parsed.note,
      };
      return;
    }

    // --- Build confirmation card ---
    const scheduleLabel =
      schedule.isRecurring
        ? `Every ${parsed.interval_details.replace(/every\s+/i, "")}`
        : `One-time on ${formatDate(schedule.scheduledAt)}`;

    ctx.session.pending = {
      step: "awaiting_voice_confirm",
      mediaType: existingMediaType ?? "voice",
      mediaUrl: existingMediaUrl,
      noteText: parsed.note,
      voiceParsedNote: parsed.note,
      voiceParsedType: parsed.type,
      voiceParsedInterval: parsed.interval_details,
      voiceScheduledAt: schedule.scheduledAt.toISOString(),
      voiceIsRecurring: schedule.isRecurring,
      voiceIntervalMinutes: schedule.intervalMinutes ?? undefined,
    };

    await ctx.reply(
      `🎙️ *Voice Memory Processed\\!*\n\n` +
      `📌 *Note:* ${escapeMarkdownV2(parsed.note)}\n` +
      `🗓️ *Schedule:* ${escapeMarkdownV2(scheduleLabel)}\n` +
      `⏰ *First Reminder:* ${escapeMarkdownV2(formatDate(schedule.scheduledAt))}\n\n` +
      `_Is this correct?_`,
      {
        parse_mode: "MarkdownV2",
        reply_markup: buildVoiceConfirmKeyboard(),
      }
    );
  } catch (err) {
    // Graceful fallback: VoiceParseError or network error
    console.error("[voiceHandler] Error parsing voice note:", err);
    
    const isParseError = err instanceof VoiceParseError;
    const isMissingKey = isParseError && err.message.includes("GEMINI_API_KEY");
    
    const fallbackMsg = isMissingKey
      ? "⚠️ **Developer Warning:** The `GEMINI_API_KEY` is not set in your `.env` file. Voice features are disabled.\n\nPlease set it up manually for now:"
      : isParseError
      ? "🎙️ I heard your voice note, but couldn't extract a clear note or schedule. Please set it up manually:"
      : "❌ Something went wrong processing your voice note. Please set it up manually:";

    ctx.session.pending = {
      step: "awaiting_note",
      mediaType: existingMediaType ?? "voice",
      mediaUrl: existingMediaUrl,
    };

    await ctx.reply(fallbackMsg + "\n\nType your note or key takeaway for this memory:");

    if (!isParseError) {
      console.error("[voiceHandler] Unexpected error:", err);
    }
  }

  // Delete the "Processing…" indicator message
  try {
    await ctx.api.deleteMessage(ctx.chat!.id, processingMsg.message_id);
  } catch {
    // Non-fatal: bot may lack delete permissions
  }
}

/**
 * Escapes special MarkdownV2 characters for safe Telegram rendering.
 */
function escapeMarkdownV2(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, "\\$&");
}
