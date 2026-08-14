// ----------------------------------------------------------------
// Session Types
// Defines the shape of the session data stored per user/chat.
// Strict step-by-step state machine for the new restructured flow.
// ----------------------------------------------------------------

export type ConversationStep =
  | "awaiting_media"           // Step 1: Receive photo/video/note
  | "awaiting_note"            // Step 2: Content summary/takeaway
  | "awaiting_reminder_type"   // Step 3: One-Time vs Cycle selection
  | "awaiting_one_time_date"   // Step 4: One-Time date selection
  | "awaiting_cycle_interval"  // Step 4: Cycle interval input
  | "awaiting_voice_confirm";  // Pro: Waiting for user to confirm Gemini parse

export interface SessionData {
  // Temporary state between conversation steps (before saving to DB)
  pending?: {
    step: ConversationStep;
    mediaType: "image" | "video" | "text" | "voice";
    mediaUrl?: string;        // Filled for photo/video after upload
    initialText?: string;     // Original text message or caption
    noteText?: string;        // User's key takeaway (filled in Step 2)
    reminderType?: "onetime" | "cycle"; // Set in Step 3

    // --- Voice note parsing fields (Gemini Flash) ---
    voiceParsedNote?: string;       // Extracted note text from Gemini
    voiceParsedType?: "one_time" | "recurring"; // Parsed reminder type
    voiceParsedInterval?: string;   // Raw interval string from Gemini
    voiceScheduledAt?: string;      // ISO string of calculated first reminder
    voiceIsRecurring?: boolean;     // Whether the reminder is recurring
    voiceIntervalMinutes?: number;  // Calculated interval in minutes (if recurring)
  };
}
