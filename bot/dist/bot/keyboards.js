"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildReminderTypeKeyboard = buildReminderTypeKeyboard;
exports.buildOneTimeKeyboard = buildOneTimeKeyboard;
exports.buildStopCycleKeyboard = buildStopCycleKeyboard;
exports.buildVoiceConfirmKeyboard = buildVoiceConfirmKeyboard;
exports.buildTimeKeyboard = buildTimeKeyboard;
exports.buildEditChoiceKeyboard = buildEditChoiceKeyboard;
const grammy_1 = require("grammy");
function buildReminderTypeKeyboard() {
    return new grammy_1.InlineKeyboard()
        .text("🕒 Bir martalik", "type_onetime")
        .text("🔄 Davriy (takrorlanuvchi)", "type_cycle");
}
function buildOneTimeKeyboard() {
    return new grammy_1.InlineKeyboard()
        .text("1 kundan keyin", "remind_1d")
        .text("3 kundan keyin", "remind_3d")
        .text("5 kundan keyin", "remind_5d")
        .row()
        .text("✏️ Boshqa sana", "remind_custom");
}
function buildStopCycleKeyboard(cycles) {
    const keyboard = new grammy_1.InlineKeyboard();
    cycles.forEach((cycle, index) => {
        const noteText = cycle.content_text || "Izohsiz";
        const truncatedNote = noteText.length > 20 ? noteText.substring(0, 20) + "..." : noteText;
        const buttonLabel = `🛑 ${truncatedNote}`;
        const callbackData = `stop_${cycle.reminder_id}`;
        keyboard.text(buttonLabel, callbackData);
        if ((index + 1) % 2 === 0 && index < cycles.length - 1) {
            keyboard.row();
        }
    });
    return keyboard;
}
function buildVoiceConfirmKeyboard() {
    return new grammy_1.InlineKeyboard()
        .text("✅ Tasdiqlash", "voice_confirm")
        .text("✏️ O'zgartirish", "voice_edit")
        .text("❌ Bekor qilish", "voice_cancel");
}
function buildTimeKeyboard() {
    return new grammy_1.InlineKeyboard()
        .text("08:00", "time_08:00")
        .text("13:00", "time_13:00")
        .text("18:00", "time_18:00")
        .row()
        .text("20:00", "time_20:00")
        .text("21:00", "time_21:00")
        .text("Boshqa vaqt", "time_custom");
}
function buildEditChoiceKeyboard() {
    return new grammy_1.InlineKeyboard()
        .text("🎯 Harakat / Izoh", "edit_field_action")
        .text("📅 Sana", "edit_field_date")
        .row()
        .text("🕐 Vaqt", "edit_field_time")
        .text("🔁 Takrorlanish", "edit_field_frequency")
        .row()
        .text("⏳ Tugash sanasi", "edit_field_end")
        .text("⬅️ Orqaga", "edit_field_back");
}
