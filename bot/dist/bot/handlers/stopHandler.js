"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.stopHandler = stopHandler;
const reminderService_1 = require("../../services/reminderService");
const keyboards_1 = require("../keyboards");
// ----------------------------------------------------------------
// /stop command handler
// Shows active recurring cycles and allows user to stop them.
// ----------------------------------------------------------------
async function stopHandler(ctx) {
    const telegramId = ctx.from?.id;
    if (!telegramId)
        return;
    try {
        const activeCycles = await (0, reminderService_1.getActiveCyclesForUser)(telegramId);
        if (activeCycles.length === 0) {
            await ctx.reply("Sizda to'xtatish uchun faol takrorlanuvchi eslatmalar yo'q.");
            return;
        }
        // Display active cycles with stop buttons
        let message = "🔄 **Faol takrorlanuvchi eslatmalaringiz:**\n\n";
        activeCycles.forEach((cycle, index) => {
            const noteText = cycle.content_text || "Izohsiz";
            const scheduledDate = new Date(cycle.scheduled_at).toLocaleString();
            message += `${index + 1}. **${noteText}**\n   Keyingi: ${scheduledDate}\n\n`;
        });
        message += "To'xtatmoqchi bo'lgan eslatmani tanlang:";
        await ctx.reply(message, {
            parse_mode: "Markdown",
            reply_markup: (0, keyboards_1.buildStopCycleKeyboard)(activeCycles),
        });
    }
    catch (err) {
        console.error("[stopHandler] Error:", err);
        await ctx.reply("❌ Faol eslatmalarni olishda xatolik yuz berdi. Iltimos, qaytadan urinib ko'ring.");
    }
}
