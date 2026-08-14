"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.receiveNoteHandler = receiveNoteHandler;
const keyboards_1 = require("../keyboards");
/**
 * Handles the user's note/takeaway text (Step 2).
 * Returns true if the message was consumed, false otherwise.
 */
async function receiveNoteHandler(ctx) {
    const pending = ctx.session.pending;
    // Only intercept if we're waiting for a note
    if (!pending || pending.step !== "awaiting_note")
        return false;
    const text = ctx.message?.text;
    if (!text)
        return false;
    // Advance session state to awaiting_reminder_type
    ctx.session.pending = {
        ...pending,
        step: "awaiting_reminder_type",
        noteText: text, // Save the text
    };
    // Step 3: Ask for reminder type selection
    await ctx.reply("How would you like to receive reminders?", {
        reply_markup: (0, keyboards_1.buildReminderTypeKeyboard)(),
    });
    return true; // Message consumed
}
