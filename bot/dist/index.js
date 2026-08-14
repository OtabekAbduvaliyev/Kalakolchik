"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const index_1 = require("./bot/index");
const reminderCron_1 = require("./scheduler/reminderCron");
// ----------------------------------------------------------------
// Application Entry Point
// Starts the bot (long-polling) and the reminder scheduler.
// ----------------------------------------------------------------
async function main() {
    console.log("🔔 Kalakolchik Bot is starting...");
    // Start the background reminder scheduler
    (0, reminderCron_1.startReminderScheduler)();
    // Start the Telegram bot (long polling)
    // grammY handles graceful shutdown automatically
    await index_1.bot.start({
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
