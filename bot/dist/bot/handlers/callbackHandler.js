"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatDate = formatDate;
exports.saveMemoryAndReminder = saveMemoryAndReminder;
exports.sendSummaryCard = sendSummaryCard;
exports.scheduleCallbackHandler = scheduleCallbackHandler;
exports.textInputHandler = textInputHandler;
exports.stopCycleCallbackHandler = stopCycleCallbackHandler;
const userService_1 = require("../../services/userService");
const memoryService_1 = require("../../services/memoryService");
const reminderService_1 = require("../../services/reminderService");
const keyboards_1 = require("../keyboards");
const dateParser_1 = require("../../utils/dateParser");
/**
 * Formats a Date into a readable string (UTC).
 */
function formatDate(date) {
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
/**
 * Core save function: writes memory + reminder to Supabase.
 */
async function saveMemoryAndReminder(telegramId, session, scheduledAt, isRecurring, recurringIntervalMinutes) {
    const pending = session.pending;
    const userId = await (0, userService_1.upsertUser)(telegramId);
    const memory = await (0, memoryService_1.createMemory)({
        userId,
        mediaType: pending.mediaType,
        mediaUrl: pending.mediaUrl,
        contentText: pending.noteText ?? pending.initialText,
    });
    await (0, reminderService_1.createReminder)(memory.id, scheduledAt, isRecurring, recurringIntervalMinutes);
}
/**
 * Send the final summary card.
 */
async function sendSummaryCard(ctx, noteText, typeText, scheduledAt) {
    const note = noteText ? `\n📌 **Note:** ${noteText}` : "";
    await ctx.reply(`✅ **Memory Saved Successfully!**${note}\n🗓️ **Type:** ${typeText}\n⏰ **Next Reminder:** ${formatDate(scheduledAt)}`, { parse_mode: "Markdown" });
}
/**
 * Main callback handler for schedule button presses.
 */
async function scheduleCallbackHandler(ctx) {
    const data = ctx.callbackQuery.data;
    await ctx.answerCallbackQuery(); // Remove the loading spinner
    const telegramId = ctx.from?.id;
    if (!telegramId)
        return;
    const pending = ctx.session.pending;
    if (!pending) {
        await ctx.reply("⚠️ Session expired. Please send your content again.");
        return;
    }
    // --- Step 3: Choose Reminder Type ---
    if (pending.step === "awaiting_reminder_type") {
        if (data === "type_onetime") {
            ctx.session.pending = { ...pending, step: "awaiting_one_time_date", reminderType: "onetime" };
            await ctx.reply("When should I remind you once?", {
                reply_markup: (0, keyboards_1.buildOneTimeKeyboard)(),
            });
            return;
        }
        if (data === "type_cycle") {
            ctx.session.pending = { ...pending, step: "awaiting_cycle_interval", reminderType: "cycle" };
            await ctx.reply("How often should this cycle? Enter an interval (e.g., 'every 2 hours', 'every 5 minutes', or 'every 1 day').");
            return;
        }
        return; // Ignore other buttons
    }
    // --- Step 4: One-Time Date Selection ---
    if (pending.step === "awaiting_one_time_date") {
        if (data === "remind_custom") {
            // Stay in awaiting_one_time_date, but we are now expecting text
            await ctx.reply("Please enter a date in format `DD/MM/YYYY` (or `DD/MM/YYYY HH:MM` for specific time).", {
                parse_mode: "Markdown"
            });
            return;
        }
        let addMinutes = 0;
        if (data === "remind_1d")
            addMinutes = 1440;
        else if (data === "remind_3d")
            addMinutes = 4320;
        else if (data === "remind_5d")
            addMinutes = 7200;
        else
            return; // Ignore unknown callback
        const scheduledAt = new Date(Date.now() + addMinutes * 60 * 1000);
        try {
            await saveMemoryAndReminder(telegramId, ctx.session, scheduledAt, false, null);
            const noteText = pending.noteText;
            ctx.session.pending = undefined; // Clear session
            await sendSummaryCard(ctx, noteText, "One-Time", scheduledAt);
        }
        catch (err) {
            console.error("[scheduleCallbackHandler] Error saving to DB:", err);
            await ctx.reply("❌ Something went wrong saving your reminder. Please try again.");
        }
    }
}
/**
 * Handles text input for Custom Dates and Cycle Intervals (Step 4).
 * Returns true if the message was consumed.
 */
async function textInputHandler(ctx) {
    const pending = ctx.session.pending;
    if (!pending)
        return false;
    const text = ctx.message?.text?.trim();
    if (!text)
        return false;
    const telegramId = ctx.from?.id;
    if (!telegramId)
        return false;
    // --- Custom One-Time Date ---
    if (pending.step === "awaiting_one_time_date") {
        const scheduledAt = (0, dateParser_1.parseCustomDate)(text);
        if (!scheduledAt) {
            await ctx.reply("❌ Invalid date format or date is in the past. Please use `DD/MM/YYYY` or `DD/MM/YYYY HH:MM`.", { parse_mode: "Markdown" });
            return true;
        }
        try {
            await saveMemoryAndReminder(telegramId, ctx.session, scheduledAt, false, null);
            const noteText = pending.noteText;
            ctx.session.pending = undefined;
            await sendSummaryCard(ctx, noteText, "One-Time", scheduledAt);
        }
        catch (err) {
            console.error("[textInputHandler] Error saving custom date:", err);
            await ctx.reply("❌ Something went wrong saving your reminder. Please try again.");
        }
        return true;
    }
    // --- Cycle Interval ---
    if (pending.step === "awaiting_cycle_interval") {
        const intervalMinutes = (0, dateParser_1.parseCycleInterval)(text);
        if (!intervalMinutes) {
            await ctx.reply("❌ I didn't understand that interval. Try something like 'every 2 hours', 'every 3 days', or 'every 5 minutes'.");
            return true;
        }
        const scheduledAt = new Date(Date.now() + intervalMinutes * 60 * 1000);
        try {
            await saveMemoryAndReminder(telegramId, ctx.session, scheduledAt, true, intervalMinutes);
            const noteText = pending.noteText;
            ctx.session.pending = undefined;
            await sendSummaryCard(ctx, noteText, "Cycle (Repeating)", scheduledAt);
        }
        catch (err) {
            console.error("[textInputHandler] Error saving cycle interval:", err);
            await ctx.reply("❌ Something went wrong saving your reminder. Please try again.");
        }
        return true;
    }
    return false;
}
/**
 * Handles callback queries for stopping cycles.
 * Callback data format: "stop_{reminder_id}"
 */
async function stopCycleCallbackHandler(ctx) {
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
        await (0, reminderService_1.stopReminder)(reminderId);
        console.log("[stopCycleCallbackHandler] Successfully stopped reminder:", reminderId);
        await ctx.reply("✅ Cycle stopped successfully. You won't receive further reminders for this memory.");
    }
    catch (err) {
        console.error("[stopCycleCallbackHandler] Error:", err);
        await ctx.reply("❌ Something went wrong stopping the cycle. Please try again.");
    }
}
