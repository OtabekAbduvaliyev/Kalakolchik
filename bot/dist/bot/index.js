"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bot = void 0;
const grammy_1 = require("grammy");
const env_1 = require("../config/env");
const startHandler_1 = require("./handlers/startHandler");
const stopHandler_1 = require("./handlers/stopHandler");
const mediaHandler_1 = require("./handlers/mediaHandler");
const noteHandler_1 = require("./handlers/noteHandler");
const callbackHandler_1 = require("./handlers/callbackHandler");
const voiceHandler_1 = require("./handlers/voiceHandler");
exports.bot = new grammy_1.Bot(env_1.env.TELEGRAM_BOT_TOKEN);
// --- Session Middleware ---
// Stores per-chat conversation state in memory.
exports.bot.use((0, grammy_1.session)({
    initial: () => ({ pending: undefined }),
}));
// --- Command Handlers ---
exports.bot.command("start", startHandler_1.startHandler);
exports.bot.command(["about", "help"], startHandler_1.startHandler);
exports.bot.command("stop", stopHandler_1.stopHandler);
// --- Inline Keyboard Callback Handlers ---
// All callback data values emitted by reminder flow keyboards must be listed here.
// grammY silently drops callbacks not matching any registered filter.
exports.bot.callbackQuery([
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
], callbackHandler_1.scheduleCallbackHandler);
// --- Stop Cycle Callback Handler ---
exports.bot.callbackQuery(/^stop_/, callbackHandler_1.stopCycleCallbackHandler);
// --- Voice Note Handler (Gemini Flash) ---
// Must be registered BEFORE the generic text/media handler
exports.bot.on("message:voice", voiceHandler_1.voiceHandler);
// --- Message Handler (Text / Photo / Video / Document / Audio) ---
exports.bot.on(["message:text", "message:photo", "message:video", "message:document", "message:audio"], async (ctx) => {
    const text = ctx.message?.text;
    // 1. Skip commands
    if (text?.startsWith("/"))
        return;
    // 2. Handle text inputs for Custom Dates and Cycle Intervals (Step 4)
    const textHandled = await (0, callbackHandler_1.textInputHandler)(ctx);
    if (textHandled)
        return;
    // 3. If user is in "awaiting_note" step, receive their note (Step 2)
    const noteHandled = await (0, noteHandler_1.receiveNoteHandler)(ctx);
    if (noteHandled)
        return;
    // 4. Otherwise treat this as new media/content (Step 1)
    await (0, mediaHandler_1.receiveMediaHandler)(ctx);
});
// --- Error Handler ---
exports.bot.catch((err) => {
    console.error("[Bot Error]", err.message, "\n", err.error);
});
