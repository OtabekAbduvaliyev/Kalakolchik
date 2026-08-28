// ----------------------------------------------------------------
// Session Types
// One pending reminder object is the source of truth for scheduling.
// ----------------------------------------------------------------

export type ConversationStep =
  | "awaiting_media"
  | "awaiting_note"
  | "awaiting_reminder_type"
  | "awaiting_one_time_date"
  | "awaiting_cycle_interval"
  | "awaiting_missing_time"
  | "awaiting_missing_date"
  | "awaiting_missing_type"
  | "awaiting_missing_frequency"
  | "awaiting_missing_note"
  | "awaiting_voice_confirm"
  | "awaiting_edit_choice"
  | "awaiting_edit_action"
  | "awaiting_edit_date"
  | "awaiting_edit_time"
  | "awaiting_edit_frequency"
  | "awaiting_edit_end_date";

export type ReminderKind = "one_time" | "recurring";

export interface PendingReminder {
  note: string | null;
  reminderType: ReminderKind | null;
  date: string | null;
  time: string | null;
  timezone: string;
  intervalMinutes: number | null;
  recurrenceText: string | null;
  endDate: string | null;
  useCapturedTime: boolean;
}

export interface SessionData {
  pending?: {
    step: ConversationStep;
    mediaType: "image" | "video" | "text" | "voice";
    mediaUrl?: string;
    initialText?: string;
    noteText?: string;
    reminderType?: "onetime" | "cycle";
    capturedAt?: string;
    reminder?: PendingReminder;
  };
}
