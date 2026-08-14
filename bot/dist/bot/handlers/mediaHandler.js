"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.downloadTelegramFile = downloadTelegramFile;
exports.receiveMediaHandler = receiveMediaHandler;
const env_1 = require("../../config/env");
const memoryService_1 = require("../../services/memoryService");
/**
 * Downloads a file from Telegram's servers by its file_id.
 * Exported so it can be reused elsewhere.
 */
async function downloadTelegramFile(fileId) {
    const fileRes = await fetch(`https://api.telegram.org/bot${env_1.env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`);
    const fileJson = (await fileRes.json());
    if (!fileJson.ok) {
        throw new Error(`Telegram getFile failed for file_id: ${fileId}`);
    }
    const filePath = fileJson.result.file_path;
    const ext = filePath.split(".").pop() ?? "bin";
    const mimeType = ext === "jpg" || ext === "jpeg"
        ? "image/jpeg"
        : ext === "mp4"
            ? "video/mp4"
            : "application/octet-stream";
    const downloadRes = await fetch(`https://api.telegram.org/file/bot${env_1.env.TELEGRAM_BOT_TOKEN}/${filePath}`);
    const arrayBuffer = await downloadRes.arrayBuffer();
    return {
        buffer: Buffer.from(arrayBuffer),
        filename: `file.${ext}`,
        mimeType,
    };
}
/**
 * Step 1 handler: Receives any media or text.
 * Uploads media to Supabase Storage (so we have the URL),
 * saves temporary state to session, and asks the user for their note.
 */
async function receiveMediaHandler(ctx) {
    const msg = ctx.message;
    if (!msg)
        return;
    const step = ctx.session.pending?.step;
    // Strict check: only accept new media if we are awaiting_media or have no active session
    if (step && step !== "awaiting_media") {
        // Let other handlers process it if possible, otherwise ignore
        return;
    }
    // Initialize session
    ctx.session.pending = undefined;
    try {
        if (msg.photo && msg.photo.length > 0) {
            // --- Photo ---
            const bestPhoto = msg.photo[msg.photo.length - 1];
            await ctx.reply("📤 Receiving your photo...");
            const { buffer, filename, mimeType } = await downloadTelegramFile(bestPhoto.file_id);
            const mediaUrl = await (0, memoryService_1.uploadToStorage)(buffer, filename, mimeType);
            ctx.session.pending = {
                step: "awaiting_note",
                mediaType: "image",
                mediaUrl,
                initialText: msg.caption ?? undefined,
            };
        }
        else if (msg.video) {
            // --- Video ---
            await ctx.reply("📤 Receiving your video...");
            const { buffer, filename, mimeType } = await downloadTelegramFile(msg.video.file_id);
            const mediaUrl = await (0, memoryService_1.uploadToStorage)(buffer, filename, mimeType);
            ctx.session.pending = {
                step: "awaiting_note",
                mediaType: "video",
                mediaUrl,
                initialText: msg.caption ?? undefined,
            };
        }
        else if (msg.text) {
            // --- Text note ---
            ctx.session.pending = {
                step: "awaiting_note",
                mediaType: "text",
                initialText: msg.text,
            };
        }
        else {
            return; // Unsupported message type
        }
        // Step 2: Ask for content summary/note
        await ctx.reply("How should this be remembered? Write a short caption, title, or key takeaway for this memory.");
    }
    catch (err) {
        console.error("[receiveMediaHandler] Error:", err);
        ctx.session.pending = undefined;
        await ctx.reply("❌ Something went wrong while receiving your file. Please try again.");
    }
}
