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

  // Step 1: Ask for content
  await ctx.reply(
    "Eslatib turishim kerak bo'lgan rasm, video, audio yoki xabarni yuboring."
  );
}
