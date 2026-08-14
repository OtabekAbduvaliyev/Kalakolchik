import cron from "node-cron";
import { bot } from "../bot/index";
import { getDueReminders, processReminderSent } from "../services/reminderService";
import { InputFile } from "grammy";

// ----------------------------------------------------------------
// Reminder Scheduler (Cron Job)
// Runs every minute, fetches all pending reminders that are due,
// sends them to the user via Telegram, and marks them as sent.
// ----------------------------------------------------------------

export function startReminderScheduler(): void {
  console.log("[Scheduler] Reminder scheduler started — running every minute.");

  // Cron expression: every minute
  cron.schedule("* * * * *", async () => {
    console.log(`[Scheduler] Checking for due reminders at ${new Date().toISOString()}`);

    let dueReminders;
    try {
      dueReminders = await getDueReminders();
    } catch (err) {
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
          await bot.api.sendMessage(
            telegram_id,
            reminderHeader + (content_text ?? "_(your saved note)_"),
            { parse_mode: "Markdown" }
          );
        } else if (media_type === "image" && media_url) {
          // Send photo
          await bot.api.sendPhoto(
            telegram_id,
            new InputFile(new URL(media_url)),
            {
              caption: reminderHeader + (content_text ?? ""),
              parse_mode: "Markdown",
            }
          );
        } else if (media_type === "video" && media_url) {
          // Send video
          await bot.api.sendVideo(
            telegram_id,
            new InputFile(new URL(media_url)),
            {
              caption: reminderHeader + (content_text ?? ""),
              parse_mode: "Markdown",
            }
          );
        } else {
          // Fallback: send link if media_url exists
          await bot.api.sendMessage(
            telegram_id,
            reminderHeader + (content_text ?? "") + (media_url ? `\n\n🔗 [View file](${media_url})` : ""),
            { parse_mode: "Markdown" }
          );
        }

        // Process the reminder (mark sent or reschedule if recurring)
        await processReminderSent(
          reminder_id, 
          reminder.is_recurring, 
          reminder.recurring_interval_minutes
        );
        console.log(`[Scheduler] Processed reminder ${reminder_id} for user ${telegram_id}.`);
      } catch (err) {
        console.error(`[Scheduler] Failed to process reminder ${reminder_id}:`, err);
        // Don't mark as sent — it will be retried next minute
      }
    }
  });
}
