import { CommandContext } from "grammy";
import { BotContext } from "../index";
import { getUserTimezone } from "../../services/userService";
import { buildTimezoneKeyboard } from "../keyboards";
import { formatZoned } from "../../utils/timezone";

// ----------------------------------------------------------------
// /timezone command handler
// Shows current timezone and options to change it.
// ----------------------------------------------------------------

export async function timezoneHandler(ctx: CommandContext<BotContext>): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  try {
    const currentTz = await getUserTimezone(telegramId);
    const nowStr = formatZoned(new Date(), currentTz);

    const message =
`🌍 *Vaqt mintaqasi sozlamalari*

Joriy vaqt mintaqangiz: \`${currentTz}\`
Hozirgi vaqtingiz: *${nowStr}*

O'zgartirish uchun quyidagi tugmalardan birini tanlang yoki yangi vaqt mintaqasini qo'lda yuboring (masalan: \`Asia/Tashkent\` yoki \`Europe/Moscow\`):`;

    await ctx.reply(message, {
      parse_mode: "Markdown",
      reply_markup: buildTimezoneKeyboard(currentTz),
    });
  } catch (err) {
    console.error("[timezoneHandler] Error:", err);
    await ctx.reply("❌ Vaqt mintaqasini tekshirishda xatolik yuz berdi.");
  }
}
