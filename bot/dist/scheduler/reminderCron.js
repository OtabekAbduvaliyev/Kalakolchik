"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startReminderScheduler = startReminderScheduler;
const node_cron_1 = __importDefault(require("node-cron"));
const index_1 = require("../bot/index");
const reminderService_1 = require("../services/reminderService");
const grammy_1 = require("grammy");
// ----------------------------------------------------------------
// Reminder Scheduler (Cron Job)
// Runs every minute, fetches all pending reminders that are due,
// sends them to the user via Telegram, and marks them as sent.
// ----------------------------------------------------------------
function startReminderScheduler() {
    console.log("[Scheduler] Reminder scheduler started — running every minute.");
    // Cron expression: every minute
    node_cron_1.default.schedule("* * * * *", async () => {
        console.log(`[Scheduler] Checking for due reminders at ${new Date().toISOString()}`);
        let dueReminders;
        try {
            dueReminders = await (0, reminderService_1.getDueReminders)();
        }
        catch (err) {
            console.error("[Scheduler] Failed to fetch due reminders:", err);
            return;
        }
        if (dueReminders.length === 0) {
            console.log("[Scheduler] No due reminders found.");
            return;
        }
        console.log(`[Scheduler] Found ${dueReminders.length} due reminder(s). Processing...`);
        for (const reminder of dueReminders) {
            const { reminder_id, telegram_id, media_type, media_url, content_text } = reminder;
            try {
                const reminderHeader = `🔔 *Time to review!*\n\n`;
                if (media_type === "text") {
                    // Send text note
                    await index_1.bot.api.sendMessage(telegram_id, reminderHeader + (content_text ?? "_(your saved note)_"), { parse_mode: "Markdown" });
                }
                else if (media_type === "image" && media_url) {
                    // Send photo
                    await index_1.bot.api.sendPhoto(telegram_id, new grammy_1.InputFile(new URL(media_url)), {
                        caption: reminderHeader + (content_text ?? ""),
                        parse_mode: "Markdown",
                    });
                }
                else if (media_type === "video" && media_url) {
                    // Send video
                    await index_1.bot.api.sendVideo(telegram_id, new grammy_1.InputFile(new URL(media_url)), {
                        caption: reminderHeader + (content_text ?? ""),
                        parse_mode: "Markdown",
                    });
                }
                else {
                    // Fallback: send link if media_url exists
                    await index_1.bot.api.sendMessage(telegram_id, reminderHeader + (content_text ?? "") + (media_url ? `\n\n🔗 [View file](${media_url})` : ""), { parse_mode: "Markdown" });
                }
                // Process the reminder (mark sent or reschedule if recurring)
                await (0, reminderService_1.processReminderSent)(reminder_id, reminder.is_recurring, reminder.recurring_interval_minutes);
                console.log(`[Scheduler] Processed reminder ${reminder_id} for user ${telegram_id}.`);
            }
            catch (err) {
                console.error(`[Scheduler] Failed to process reminder ${reminder_id}:`, err);
                // Don't mark as sent — it will be retried next minute
            }
        }
    });
}
