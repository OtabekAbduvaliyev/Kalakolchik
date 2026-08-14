import { bot } from "./bot/index";
import { startReminderScheduler } from "./scheduler/reminderCron";

// ----------------------------------------------------------------
// Application Entry Point
// Starts the bot (long-polling) and the reminder scheduler.
// ----------------------------------------------------------------

async function main(): Promise<void> {
  console.log("🔔 Kalakolchik Bot is starting...");

  // Start the background reminder scheduler
  startReminderScheduler();

  // Start the Telegram bot (long polling)
  // grammY handles graceful shutdown automatically
  await bot.start({
    onStart: (botInfo) => {
      console.log(`✅ Bot is running as @${botInfo.username}`);
      console.log("📬 Listening for messages...\n");
    },
  });
}

main().catch((err) => {
  console.error("❌ Fatal error during startup:", err);
  process.exit(1);
});
