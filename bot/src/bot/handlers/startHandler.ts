import { CommandContext } from "grammy";
import { BotContext } from "../index";
import { upsertUser } from "../../services/userService";

// ----------------------------------------------------------------
// /start command handler
// Step 1: Registers the user and asks for media/content.
// ----------------------------------------------------------------

export async function startHandler(ctx: CommandContext<BotContext>): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  try {
    await upsertUser(telegramId);
  } catch (err) {
    console.error("[startHandler] Failed to upsert user:", err);
  }

  // Initialize session for Step 1
  ctx.session.pending = { step: "awaiting_media", mediaType: "text" };

  const firstName = ctx.from?.first_name ? ` ${ctx.from.first_name}` : "";

  const welcomeMessage = 
`👋 **Assalomu alaykum${firstName}!**

Eslatib turishim kerak bo'lgan rasm, video, audio yoki xabarni yuboring:`;

  await ctx.reply(welcomeMessage, { parse_mode: "Markdown" });
}

export async function newReminderHandler(ctx: CommandContext<BotContext>): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  ctx.session.pending = { step: "awaiting_media", mediaType: "text" };
  await ctx.reply("📝 Yangi eslatma yaratish uchun rasm, video, audio, ovozli xabar yoki matn yuboring:");
}

