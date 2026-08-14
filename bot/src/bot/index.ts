import { Bot, session, Context, SessionFlavor } from "grammy";
import { env } from "../config/env";
import { SessionData } from "./session";
import { startHandler } from "./handlers/startHandler";
import { stopHandler } from "./handlers/stopHandler";
import { receiveMediaHandler } from "./handlers/mediaHandler";
import { receiveNoteHandler } from "./handlers/noteHandler";
import { scheduleCallbackHandler, textInputHandler, stopCycleCallbackHandler } from "./handlers/callbackHandler";
import { voiceHandler } from "./handlers/voiceHandler";

// ----------------------------------------------------------------
// Bot Initialization
// ----------------------------------------------------------------

export type BotContext = Context & SessionFlavor<SessionData>;

export const bot = new Bot<BotContext>(env.TELEGRAM_BOT_TOKEN);

// --- Session Middleware ---
// Stores per-chat conversation state in memory.
bot.use(
  session<SessionData, BotContext>({
    initial: (): SessionData => ({ pending: undefined }),
  })
);

// --- Command Handlers ---
bot.command("start", startHandler);
bot.command("stop", stopHandler);

// --- Inline Keyboard Callback Handlers ---
bot.callbackQuery(
  [
    "type_onetime", "type_cycle",
    "remind_1d", "remind_3d", "remind_5d", "remind_custom",
    "voice_confirm", "voice_edit",
  ],
  scheduleCallbackHandler
);

// --- Stop Cycle Callback Handler ---
bot.callbackQuery(/^stop_/, stopCycleCallbackHandler);

// --- Voice Note Handler (Gemini Flash) ---
// Must be registered BEFORE the generic text/media handler
bot.on("message:voice", voiceHandler);

// --- Message Handler (Text / Photo / Video) ---
bot.on(["message:text", "message:photo", "message:video"], async (ctx) => {
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
