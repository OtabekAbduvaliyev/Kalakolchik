"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildReminderTypeKeyboard = buildReminderTypeKeyboard;
exports.buildOneTimeKeyboard = buildOneTimeKeyboard;
exports.buildStopCycleKeyboard = buildStopCycleKeyboard;
const grammy_1 = require("grammy");
// ----------------------------------------------------------------
// Keyboards
// Clean inline keyboards for the strict step-by-step state machine.
// ----------------------------------------------------------------
/**
 * Step 3: Reminder Type Selection
 * Shows two options: One-Time or Cycle (Repeating)
 */
function buildReminderTypeKeyboard() {
    return new grammy_1.InlineKeyboard()
        .text("🕒 One-Time", "type_onetime")
        .text("🔄 Cycle (Repeating)", "type_cycle");
}
/**
 * Step 4: One-Time Date Selection
 * Shows preset intervals and custom date option
 */
function buildOneTimeKeyboard() {
    return new grammy_1.InlineKeyboard()
        .text("In 1 Day", "remind_1d")
        .text("In 3 Days", "remind_3d")
        .text("In 5 Days", "remind_5d")
        .row()
        .text("✏️ Custom Date", "remind_custom");
}
/**
 * Stop Cycle Selection Keyboard
 * Shows active cycles with stop buttons
 */
function buildStopCycleKeyboard(cycles) {
    const keyboard = new grammy_1.InlineKeyboard();
    cycles.forEach((cycle, index) => {
        const noteText = cycle.content_text || "No note";
        const truncatedNote = noteText.length > 20 ? noteText.substring(0, 20) + "..." : noteText;
        const buttonLabel = `🛑 ${truncatedNote}`;
        const callbackData = `stop_${cycle.reminder_id}`;
        keyboard.text(buttonLabel, callbackData);
        // Add rows with 2 buttons per row for better layout
        if ((index + 1) % 2 === 0 && index < cycles.length - 1) {
            keyboard.row();
        }
    });
    return keyboard;
}
