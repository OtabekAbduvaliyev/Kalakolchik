import { CommandContext } from "grammy";
import { BotContext } from "../index";
import { getActiveCyclesForUser } from "../../services/reminderService";
import { buildStopCycleKeyboard } from "../keyboards";

// ----------------------------------------------------------------
// /stop command handler
// Shows active recurring cycles and allows user to stop them.
// ----------------------------------------------------------------

export async function stopHandler(ctx: CommandContext<BotContext>): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  try {
    const activeCycles = await getActiveCyclesForUser(telegramId);

    if (activeCycles.length === 0) {
      await ctx.reply("You don't have any active recurring cycles to stop.");
      return;
    }

    // Display active cycles with stop buttons
    let message = "🔄 **Your Active Cycles:**\n\n";
    
    activeCycles.forEach((cycle, index) => {
      const noteText = cycle.content_text || "No note";
      const scheduledDate = new Date(cycle.scheduled_at).toLocaleString();
      message += `${index + 1}. **${noteText}**\n   Next: ${scheduledDate}\n\n`;
    });

    message += "Select a cycle to stop:";

    await ctx.reply(message, {
      parse_mode: "Markdown",
      reply_markup: buildStopCycleKeyboard(activeCycles),
    });
  } catch (err) {
    console.error("[stopHandler] Error:", err);
    await ctx.reply("❌ Something went wrong fetching your active cycles. Please try again.");
  }
}