"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startHandler = startHandler;
const userService_1 = require("../../services/userService");
// ----------------------------------------------------------------
// /start command handler
// Step 1: Registers the user and asks for media/content.
// ----------------------------------------------------------------
async function startHandler(ctx) {
    const telegramId = ctx.from?.id;
    if (!telegramId)
        return;
    try {
        await (0, userService_1.upsertUser)(telegramId);
    }
    catch (err) {
        console.error("[startHandler] Failed to upsert user:", err);
    }
    // Initialize session for Step 1
    ctx.session.pending = { step: "awaiting_media", mediaType: "text" };
    const firstName = ctx.from?.first_name ? ` ${ctx.from.first_name}` : "";
    const welcomeMessage = `👋 **Assalomu alaykum${firstName}!**

Eslatib turishim kerak bo'lgan rasm, video, audio yoki xabarni yuboring:`;
    await ctx.reply(welcomeMessage, { parse_mode: "Markdown" });
}
