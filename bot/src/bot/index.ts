import { Bot, session, Context, SessionFlavor } from "grammy";
import { env } from "../config/env";
import { SessionData } from "./session";
import { startHandler, newReminderHandler } from "./handlers/startHandler";
import { stopHandler } from "./handlers/stopHandler";
import { helpHandler } from "./handlers/helpHandler";
import { cancelHandler } from "./handlers/cancelHandler";
import { remindersHandler } from "./handlers/remindersHandler";
import { timezoneHandler } from "./handlers/timezoneHandler";
import { receiveMediaHandler } from "./handlers/mediaHandler";
import { receiveNoteHandler } from "./handlers/noteHandler";
import {
  scheduleCallbackHandler,
  textInputHandler,
  stopCycleCallbackHandler,
  timezoneCallbackHandler,
} from "./handlers/callbackHandler";
import { voiceHandler } from "./handlers/voiceHandler";

// ----------------------------------------------------------------
// Bot Initialization
// ----------------------------------------------------------------

export type BotContext = Context & SessionFlavor<SessionData>;

export const bot = new Bot<BotContext>(env.TELEGRAM_BOT_TOKEN);

/**
 * Registers default bot commands in the Telegram menu button
 */
export async function registerBotCommands(botInstance: Bot<BotContext>): Promise<void> {
  try {
    await botInstance.api.setMyCommands([
      { command: "start", description: "Botni ishga tushirish / Xush kelibsiz" },
      { command: "new", description: "Yangi eslatma yaratish" },
      { command: "reminders", description: "Faol eslatmalar ro'yxati" },
      { command: "stop", description: "Takrorlanuvchi eslatmalarni to'xtatish" },
      { command: "timezone", description: "Vaqt mintaqasini sozlash" },
      { command: "help", description: "Qo'llanma va yordam" },
      { command: "cancel", description: "Joriy amalni bekor qilish" },
    ]);
    console.log("✅ Bot default commands registered successfully.");
  } catch (err) {
    console.error("⚠️ Failed to set bot commands:", err);
  }
}

// --- Session Middleware ---
// Stores per-chat conversation state in memory.
bot.use(
  session<SessionData, BotContext>({
    initial: (): SessionData => ({ pending: undefined }),
  })
);

// --- Command Handlers ---
bot.command("start", startHandler);
bot.command("new", newReminderHandler);
bot.command(["reminders", "list"], remindersHandler);
bot.command("stop", stopHandler);
bot.command("timezone", timezoneHandler);
bot.command(["about", "help"], helpHandler);
bot.command("cancel", cancelHandler);

// --- Timezone Selection Callback Handler ---
bot.callbackQuery(/^tz_/, timezoneCallbackHandler);

// --- Stop Cycle Callback Handler ---
bot.callbackQuery(/^stop_/, stopCycleCallbackHandler);

// --- Inline Keyboard Callback Handlers ---
// All callback data values emitted by reminder flow keyboards must be listed here.
// grammY silently drops callbacks not matching any registered filter.
bot.callbackQuery(
  [
    // Reminder type selection (old flow + voice flow)
    "type_onetime", "type_cycle",
    // One-time quick date selection (old flow)
    "remind_1d", "remind_3d", "remind_5d", "remind_custom",
    // Preview confirmation (voice flow)
    "voice_confirm", "voice_edit", "voice_cancel",
    // Time picker keyboard
    "time_08:00", "time_13:00", "time_18:00", "time_20:00", "time_21:00", "time_custom",
    // Edit field selection keyboard
    "edit_field_action", "edit_field_date", "edit_field_time",
    "edit_field_frequency", "edit_field_end", "edit_field_back",
  ],
  scheduleCallbackHandler
);

// --- Voice Note Handler (Gemini Flash) ---
// Must be registered BEFORE the generic text/media handler
bot.on("message:voice", voiceHandler);

// --- Message Handler (Text / Photo / Video / Document / Audio) ---
bot.on(["message:text", "message:photo", "message:video", "message:document", "message:audio"], async (ctx) => {
  const text = ctx.message?.text;

  // 1. Skip commands
  if (text?.startsWith("/")) return;

  // 2. Handle text inputs for Custom Dates and Cycle Intervals (Step 4)
  const textHandled = await textInputHandler(ctx);
  if (textHandled) return;

  // 3. If user is in "awaiting_note" step, receive their note (Step 2)
  const noteHandled = await receiveNoteHandler(ctx);
  if (noteHandled) return;

  // 4. Otherwise treat this as new media/content (Step 1)
  await receiveMediaHandler(ctx);
});

// --- Error Handler ---
bot.catch((err) => {
  console.error("[Bot Error]", err.message, "\n", err.error);
});
