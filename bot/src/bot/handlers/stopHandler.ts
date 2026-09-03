import { CommandContext } from "grammy";
import { BotContext } from "../index";
import { getActiveCyclesForUser } from "../../services/reminderService";
import { buildStopCycleKeyboard } from "../keyboards";

import { getUserTimezone } from "../../services/userService";
import { formatZoned } from "../../utils/timezone";

// ----------------------------------------------------------------
// /stop command handler
// Shows active recurring cycles and allows user to stop them.
// ----------------------------------------------------------------

export async function stopHandler(ctx: CommandContext<BotContext>): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  try {
    const timezone = await getUserTimezone(telegramId);
    const activeCycles = await getActiveCyclesForUser(telegramId);

    if (activeCycles.length === 0) {
      await ctx.reply("Sizda to'xtatish uchun faol takrorlanuvchi eslatmalar yo'q.");
      return;
    }

    // Display active cycles with stop buttons
    let message = "🔄 **Faol takrorlanuvchi eslatmalaringiz:**\n\n";
    
    activeCycles.forEach((cycle, index) => {
      const noteText = cycle.content_text || "Izohsiz";
      const scheduledDate = formatZoned(new Date(cycle.scheduled_at), timezone);
      message += `${index + 1}. **${noteText}**\n   ⏰ Keyingi: ${scheduledDate}\n\n`;
    });

    message += "To'xtatmoqchi bo'lgan eslatmani tanlang:";

    await ctx.reply(message, {
      parse_mode: "Markdown",
      reply_markup: buildStopCycleKeyboard(activeCycles),
    });
  } catch (err) {
    console.error("[stopHandler] Error:", err);
    await ctx.reply("❌ Faol eslatmalarni olishda xatolik yuz berdi. Iltimos, qaytadan urinib ko'ring.");
  }
}