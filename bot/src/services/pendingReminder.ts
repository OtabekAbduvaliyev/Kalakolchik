import { PendingReminder, ReminderKind } from "../bot/session";
import { parseRecurrence } from "../utils/dateParser";
import {
  DEFAULT_TIMEZONE,
  endOfDateInTimeZone,
  formatLongDate,
  timeInTimeZone,
  todayInTimeZone,
  zonedWallTimeToUtc,
} from "../utils/timezone";

export type MissingField = "note" | "reminderType" | "date" | "time" | "recurrence";

export interface ParsedReminder {
  note: string | null;
  reminderType: ReminderKind | null;
  date: string | null;
  time: string | null;
  timezone: string | null;
  intervalMinutes: number | null;
  recurrenceText: string | null;
  endDate: string | null;
  useUploadTime: boolean;
}

export function emptyPendingReminder(timezone: string = DEFAULT_TIMEZONE): PendingReminder {
  return {
    note: null,
    reminderType: null,
    date: null,
    time: null,
    timezone,
    intervalMinutes: null,
    recurrenceText: null,
    endDate: null,
    useCapturedTime: false,
  };
}

export function parsedToPending(parsed: ParsedReminder): PendingReminder {
  let reminderType = parsed.reminderType;
  if (!reminderType && parsed.intervalMinutes) reminderType = "recurring";

  let recurrenceText = parsed.recurrenceText;
  let intervalMinutes = parsed.intervalMinutes;
  if (reminderType === "recurring" && !intervalMinutes && recurrenceText) {
    const rec = parseRecurrence(recurrenceText);
    if (rec) {
      intervalMinutes = rec.intervalMinutes;
      recurrenceText = rec.recurrenceText;
    }
  }
  if (reminderType === "recurring" && intervalMinutes && !recurrenceText) {
    recurrenceText = parseRecurrence(`every ${intervalMinutes} minutes`)?.recurrenceText
      ?? `Every ${intervalMinutes} minutes`;
  }

  return {
    note: parsed.note,
    reminderType,
    date: parsed.date,
    time: parsed.useUploadTime ? null : parsed.time,
    timezone: parsed.timezone || DEFAULT_TIMEZONE,
    intervalMinutes,
    recurrenceText,
    endDate: parsed.endDate,
    useCapturedTime: parsed.useUploadTime,
  };
}

export function applyCapturedTimeIfRequested(
  reminder: PendingReminder,
  capturedAt: string | undefined
): PendingReminder {
  if (!reminder.useCapturedTime || reminder.time || !capturedAt) return reminder;
  return {
    ...reminder,
    time: timeInTimeZone(new Date(capturedAt), reminder.timezone),
  };
}

export function getMissingFields(reminder: PendingReminder): MissingField[] {
  const missing: MissingField[] = [];

  if (!reminder.note?.trim()) missing.push("note");
  if (!reminder.reminderType) missing.push("reminderType");

  if (reminder.reminderType === "one_time") {
    if (!reminder.date) missing.push("date");
    if (!reminder.time) missing.push("time");
  }

  if (reminder.reminderType === "recurring") {
    if (!reminder.intervalMinutes) missing.push("recurrence");
    if (!reminder.time) missing.push("time");
  }

  return missing;
}

export function computeScheduledAt(
  reminder: PendingReminder,
  capturedAt?: string
): Date | null {
  const filled = applyCapturedTimeIfRequested(reminder, capturedAt);
  const { time, timezone, reminderType, intervalMinutes } = filled;
  if (!time) return null;

  let date = filled.date;
  if (reminderType === "recurring" && !date) {
    date = todayInTimeZone(timezone);
  }
  if (!date) return null;

  let dt = zonedWallTimeToUtc(date, time, timezone);
  if (!dt) return null;

  if (reminderType === "recurring" && intervalMinutes) {
    const endLimit = filled.endDate ? endOfDateInTimeZone(filled.endDate, timezone) : null;
    let guard = 0;
    while (dt.getTime() <= Date.now() && guard < 400) {
      dt = new Date(dt.getTime() + intervalMinutes * 60 * 1000);
      guard += 1;
    }
    if (endLimit && dt > endLimit) return null;
  }

  if (reminderType === "one_time" && dt.getTime() <= Date.now()) {
    return null;
  }

  return dt;
}

export function countOccurrences(reminder: PendingReminder, capturedAt?: string): number | null {
  if (reminder.reminderType !== "recurring" || !reminder.endDate || !reminder.intervalMinutes) {
    return null;
  }

  const first = computeScheduledAt(reminder, capturedAt);
  const endLimit = endOfDateInTimeZone(reminder.endDate, reminder.timezone);
  if (!first || !endLimit) return null;

  let count = 0;
  let t = first.getTime();
  const end = endLimit.getTime();
  const step = reminder.intervalMinutes * 60 * 1000;

  while (t <= end && count < 10000) {
    count += 1;
    t += step;
  }

  return count > 0 ? count : null;
}

export function contentLabel(mediaType: string): string {
  if (mediaType === "image") return "Rasm";
  if (mediaType === "video") return "Video";
  if (mediaType === "text") return "Xabar / Matn";
  if (mediaType === "voice") return "Ovozli xabar";
  return mediaType;
}

export function buildPreviewText(opts: {
  mediaType: string;
  reminder: PendingReminder;
  capturedAt?: string;
  initialText?: string;
}): string | null {
  const { mediaType, reminder, capturedAt, initialText } = opts;
  const missing = getMissingFields(reminder);
  if (missing.length > 0) return null;

  const scheduled = computeScheduledAt(reminder, capturedAt);
  if (!scheduled) return null;

  let contentDesc = contentLabel(mediaType);
  if (mediaType === "text" && initialText) {
    const previewSnippet = initialText.length > 60 ? initialText.slice(0, 57) + "..." : initialText;
    contentDesc = `Xabar ("${previewSnippet}")`;
  }

  const lines = [
    "🧠 Eslatma ko'rinishi",
    "",
    "📎 Tarkib:",
    contentDesc,
    "",
    "🎯 Harakat / Vazifa:",
    reminder.note ?? "—",
  ];

  if (reminder.reminderType === "recurring") {
    const startDate = reminder.date ?? todayInTimeZone(reminder.timezone);
    lines.push("", "📅 Boshlanishi:", formatLongDate(startDate, reminder.timezone));
    lines.push("", "🔁 Takrorlanishi:", reminder.recurrenceText ?? "Takrorlanuvchi");
    lines.push("", "🕐 Vaqti:", reminder.time ?? "—");
    lines.push("", "🌍 Vaqt mintaqasi:", reminder.timezone);
    if (reminder.endDate) {
      lines.push("", "⏳ Gacha:", formatLongDate(reminder.endDate, reminder.timezone));
      const total = countOccurrences(reminder, capturedAt);
      if (total !== null) {
        lines.push("", "🔔 Jami eslatmalar:", String(total));
      }
    }
  } else {
    lines.push("", "📅 Sana:", formatLongDate(reminder.date!, reminder.timezone));
    lines.push("", "🕐 Vaqti:", reminder.time ?? "—");
    lines.push("", "🌍 Vaqt mintaqasi:", reminder.timezone);
  }

  lines.push("", "Barchasi to'g'rimi?");
  return lines.join("\n");
}

export function buildCreatedMessage(reminder: PendingReminder): string {
  if (reminder.reminderType === "recurring") {
    const until = reminder.endDate
      ? `\n${formatLongDate(reminder.endDate, reminder.timezone)} sanasigacha.`
      : ".";
    return `✅ Eslatma yaratildi!\n\nSizga ${(reminder.recurrenceText ?? "belgilangan tartibda").toLowerCase()} soat ${reminder.time} da eslatib turaman${until}`;
  }

  return `✅ Eslatma yaratildi!\n\nSizga ${formatLongDate(reminder.date!, reminder.timezone)} kuni soat ${reminder.time} da eslataman.`;
}

export function logReminder(event: string, data?: Record<string, unknown>): void {
  if (data) {
    console.log(`[REMINDER] ${event}`, JSON.stringify(data));
  } else {
    console.log(`[REMINDER] ${event}`);
  }
}
