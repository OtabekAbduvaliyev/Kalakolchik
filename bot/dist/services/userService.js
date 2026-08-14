"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.upsertUser = upsertUser;
const supabase_1 = require("../db/supabase");
// ----------------------------------------------------------------
// User Service
// Handles user lookup and registration in the `users` table.
// ----------------------------------------------------------------
/**
 * Finds an existing user by their Telegram ID, or creates a new one.
 * Returns the user's internal UUID.
 */
async function upsertUser(telegramId) {
    // First, try to find the existing user
    const { data: existing, error: findError } = await supabase_1.supabase
        .from("users")
        .select("id")
        .eq("telegram_id", telegramId)
        .maybeSingle();
    if (findError) {
        throw new Error(`Failed to find user: ${findError.message}`);
    }
    if (existing) {
        return existing.id;
    }
    // User not found — create a new record
    const { data: created, error: createError } = await supabase_1.supabase
        .from("users")
        .insert({ telegram_id: telegramId })
        .select("id")
        .single();
    if (createError || !created) {
        throw new Error(`Failed to create user: ${createError?.message}`);
    }
    return created.id;
}
