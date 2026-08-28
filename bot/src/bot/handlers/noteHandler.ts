import { Context, SessionFlavor } from "grammy";
import { SessionData } from "../session";
import { buildReminderTypeKeyboard } from "../keyboards";

// ----------------------------------------------------------------
// Note Handler
// Step 2: Receives the user's key takeaway / note text.
// Stores it in session and asks for reminder type.
// ----------------------------------------------------------------

type BotContext = Context & SessionFlavor<SessionData>;

/**
 * Handles the user's note/takeaway text (Step 2).
 * Returns true if the message was consumed, false otherwise.
 */
export async function receiveNoteHandler(ctx: BotContext): Promise<boolean> {
  const pending = ctx.session.pending;

  // Only intercept if we're waiting for a note
  if (!pending || pending.step !== "awaiting_note") return false;

  const text = ctx.message?.text;
  if (!text) return false;

  // Advance session state to awaiting_reminder_type
  ctx.session.pending = {
    ...pending,
    step: "awaiting_reminder_type",
    noteText: text, // Save the text
  };

  // Step 3: Ask for reminder type selection
  await ctx.reply("Eslatmani qanday tarzda qabul qilmoqchisiz?", {
    reply_markup: buildReminderTypeKeyboard(),
  });

  return true; // Message consumed
}
