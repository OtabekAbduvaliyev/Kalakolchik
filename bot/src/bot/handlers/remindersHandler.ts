import { CommandContext } from "grammy";
import { BotContext } from "../index";
import { getUserReminders } from "../../services/reminderService";
import { getUserTimezone } from "../../services/userService";
import { formatZoned } from "../../utils/timezone";

// ----------------------------------------------------------------
// /reminders (and /list) command handler
// Lists all pending one-time and recurring reminders for the user.
// ----------------------------------------------------------------

export async function remindersHandler(ctx: CommandContext<BotContext>): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  try {
    const timezone = await getUserTimezone(telegramId);
    const reminders = await getUserReminders(telegramId);

    if (reminders.length === 0) {
      await ctx.reply(
        "📭 Sizda hozircha kutilayotgan eslatmalar yo'q.\n\nYangi eslatma yaratish uchun xabar, rasm yoki ovozli xabar yuboring!"
      );
      return;
    }

    const oneTimes = reminders.filter((r) => !r.is_recurring);
    const recurring = reminders.filter((r) => r.is_recurring);

    let message = `📋 *Sizning eslatmalaringiz* (Vaqt: \`${timezone}\`)\n\n`;

    if (oneTimes.length > 0) {
      message += `🕒 *Bir martalik eslatmalar (${oneTimes.length}):*\n`;
      oneTimes.forEach((item, index) => {
        const text = item.content_text ? item.content_text.slice(0, 45) : "(Fayl / media)";
        const dateStr = formatZoned(new Date(item.scheduled_at), timezone);
        message += `${index + 1}. *${text}*\n   📅 ${dateStr}\n`;
      });
      message += "\n";
    }

    if (recurring.length > 0) {
      message += `🔄 *Takrorlanuvchi eslatmalar (${recurring.length}):*\n`;
      recurring.forEach((item, index) => {
        const text = item.content_text ? item.content_text.slice(0, 45) : "(Fayl / media)";
        const dateStr = formatZoned(new Date(item.scheduled_at), timezone);
        message += `${index + 1}. *${text}*\n   ⏰ Keyingi: ${dateStr}\n`;
      });
      message += "\n💡 Takrorlanuvchi eslatmalarni to'xtatish uchun: /stop";
    }

    await ctx.reply(message, { parse_mode: "Markdown" });
  } catch (err) {
    console.error("[remindersHandler] Error:", err);
    await ctx.reply("❌ Eslatmalarni yuklashda xatolik yuz berdi. Iltimos, qaytadan urinib ko'ring.");
  }
}
