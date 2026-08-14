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
    // Step 1: Ask for content
    await ctx.reply("Please send me the photo, video, or note you want to remember.");
}
