import { supabase } from "../db/supabase";

// ----------------------------------------------------------------
// Memory Service
// Handles media upload to Supabase Storage and saving memory
// records to the `memories` table.
// ----------------------------------------------------------------

export type MediaType = "image" | "video" | "text" | "voice";

export interface Memory {
  id: string;
  user_id: string;
  media_type: MediaType;
  media_url: string | null;
  content_text: string | null;
  created_at: string;
}

/**
 * Uploads a binary buffer to Supabase Storage under the `memories` bucket.
 * Returns the public/signed URL of the uploaded file.
 */
export async function uploadToStorage(
  buffer: Buffer,
  filename: string,
  mimeType: string
): Promise<string> {
  const storagePath = `uploads/${Date.now()}_${filename}`;

  const { error: uploadError } = await supabase.storage
    .from("memories")
    .upload(storagePath, buffer, {
      contentType: mimeType,
      upsert: false,
    });

  if (uploadError) {
    throw new Error(`Failed to upload file to storage: ${uploadError.message}`);
  }

  // Get the public URL for the uploaded media file
  const { data } = supabase.storage
    .from("memories")
    .getPublicUrl(storagePath);

  return data.publicUrl;
}

/**
 * Creates a new memory record in the `memories` table.
 * Returns the full created memory object.
 */
export async function createMemory(params: {
  userId: string;
  mediaType: MediaType;
  mediaUrl?: string;
  contentText?: string;
}): Promise<Memory> {
  const { data, error } = await supabase
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

  return data as Memory;
}
