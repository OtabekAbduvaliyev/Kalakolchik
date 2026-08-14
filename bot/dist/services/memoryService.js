"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadToStorage = uploadToStorage;
exports.createMemory = createMemory;
const supabase_1 = require("../db/supabase");
/**
 * Uploads a binary buffer to Supabase Storage under the `memories` bucket.
 * Returns the public/signed URL of the uploaded file.
 */
async function uploadToStorage(buffer, filename, mimeType) {
    const storagePath = `uploads/${Date.now()}_${filename}`;
    const { error: uploadError } = await supabase_1.supabase.storage
        .from("memories")
        .upload(storagePath, buffer, {
        contentType: mimeType,
        upsert: false,
    });
    if (uploadError) {
        throw new Error(`Failed to upload file to storage: ${uploadError.message}`);
    }
    // Get the public URL for the uploaded media file
    const { data } = supabase_1.supabase.storage
        .from("memories")
        .getPublicUrl(storagePath);
    return data.publicUrl;
}
/**
 * Creates a new memory record in the `memories` table.
 * Returns the full created memory object.
 */
async function createMemory(params) {
    const { data, error } = await supabase_1.supabase
        .from("memories")
        .insert({
        user_id: params.userId,
        media_type: params.mediaType,
        media_url: params.mediaUrl ?? null,
        content_text: params.contentText ?? null,
    })
        .select()
        .single();
    if (error || !data) {
        throw new Error(`Failed to save memory: ${error?.message}`);
    }
    return data;
}
