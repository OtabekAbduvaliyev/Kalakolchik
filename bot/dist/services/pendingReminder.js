"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.emptyPendingReminder = emptyPendingReminder;
exports.parsedToPending = parsedToPending;
exports.applyCapturedTimeIfRequested = applyCapturedTimeIfRequested;
exports.getMissingFields = getMissingFields;
exports.computeScheduledAt = computeScheduledAt;
exports.countOccurrences = countOccurrences;
exports.contentLabel = contentLabel;
exports.buildPreviewText = buildPreviewText;
exports.buildCreatedMessage = buildCreatedMessage;
exports.logReminder = logReminder;
const dateParser_1 = require("../utils/dateParser");
const timezone_1 = require("../utils/timezone");
function emptyPendingReminder(timezone = timezone_1.DEFAULT_TIMEZONE) {
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
function parsedToPending(parsed) {
    let reminderType = parsed.reminderType;
    if (!reminderType && parsed.intervalMinutes)
        reminderType = "recurring";
    let recurrenceText = parsed.recurrenceText;
    let intervalMinutes = parsed.intervalMinutes;
    if (reminderType === "recurring" && !intervalMinutes && recurrenceText) {
        const rec = (0, dateParser_1.parseRecurrence)(recurrenceText);
        if (rec) {
            intervalMinutes = rec.intervalMinutes;
            recurrenceText = rec.recurrenceText;
        }
    }
    if (reminderType === "recurring" && intervalMinutes && !recurrenceText) {
        recurrenceText = (0, dateParser_1.parseRecurrence)(`every ${intervalMinutes} minutes`)?.recurrenceText
            ?? `Every ${intervalMinutes} minutes`;
    }
    return {
        note: parsed.note,
        reminderType,
        date: parsed.date,
        time: parsed.useUploadTime ? null : parsed.time,
        timezone: parsed.timezone || timezone_1.DEFAULT_TIMEZONE,
        intervalMinutes,
        recurrenceText,
        endDate: parsed.endDate,
        useCapturedTime: parsed.useUploadTime,
    };
}
function applyCapturedTimeIfRequested(reminder, capturedAt) {
    if (!reminder.useCapturedTime || reminder.time || !capturedAt)
        return reminder;
    return {
        ...reminder,
        time: (0, timezone_1.timeInTimeZone)(new Date(capturedAt), reminder.timezone),
    };
}
function getMissingFields(reminder) {
    const missing = [];
    if (!reminder.note?.trim())
        missing.push("note");
    if (!reminder.reminderType)
        missing.push("reminderType");
    if (reminder.reminderType === "one_time") {
        if (!reminder.date)
            missing.push("date");
        if (!reminder.time)
            missing.push("time");
    }
    if (reminder.reminderType === "recurring") {
        if (!reminder.intervalMinutes)
            missing.push("recurrence");
        if (!reminder.time)
            missing.push("time");
    }
    return missing;
}
function computeScheduledAt(reminder, capturedAt) {
    const filled = applyCapturedTimeIfRequested(reminder, capturedAt);
    const { time, timezone, reminderType, intervalMinutes } = filled;
    if (!time)
        return null;
    let date = filled.date;
    if (reminderType === "recurring" && !date) {
        date = (0, timezone_1.todayInTimeZone)(timezone);
    }
    if (!date)
        return null;
    let dt = (0, timezone_1.zonedWallTimeToUtc)(date, time, timezone);
    if (!dt)
        return null;
    if (reminderType === "recurring" && intervalMinutes) {
        const endLimit = filled.endDate ? (0, timezone_1.endOfDateInTimeZone)(filled.endDate, timezone) : null;
        let guard = 0;
        while (dt.getTime() <= Date.now() && guard < 400) {
            dt = new Date(dt.getTime() + intervalMinutes * 60 * 1000);
            guard += 1;
        }
        if (endLimit && dt > endLimit)
            return null;
    }
    if (reminderType === "one_time" && dt.getTime() <= Date.now()) {
        return null;
    }
    return dt;
}
function countOccurrences(reminder, capturedAt) {
    if (reminder.reminderType !== "recurring" || !reminder.endDate || !reminder.intervalMinutes) {
        return null;
    }
    const first = computeScheduledAt(reminder, capturedAt);
    const endLimit = (0, timezone_1.endOfDateInTimeZone)(reminder.endDate, reminder.timezone);
    if (!first || !endLimit)
        return null;
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
function contentLabel(mediaType) {
    if (mediaType === "image")
        return "Rasm";
    if (mediaType === "video")
        return "Video";
    if (mediaType === "text")
        return "Xabar / Matn";
    if (mediaType === "voice")
        return "Ovozli xabar";
    return mediaType;
}
function buildPreviewText(opts) {
    const { mediaType, reminder, capturedAt, initialText } = opts;
    const missing = getMissingFields(reminder);
    if (missing.length > 0)
        return null;
    const scheduled = computeScheduledAt(reminder, capturedAt);
    if (!scheduled)
        return null;
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
        const startDate = reminder.date ?? (0, timezone_1.todayInTimeZone)(reminder.timezone);
        lines.push("", "📅 Boshlanishi:", (0, timezone_1.formatLongDate)(startDate, reminder.timezone));
        lines.push("", "🔁 Takrorlanishi:", reminder.recurrenceText ?? "Takrorlanuvchi");
        lines.push("", "🕐 Vaqti:", reminder.time ?? "—");
        lines.push("", "🌍 Vaqt mintaqasi:", reminder.timezone);
        if (reminder.endDate) {
            lines.push("", "⏳ Gacha:", (0, timezone_1.formatLongDate)(reminder.endDate, reminder.timezone));
            const total = countOccurrences(reminder, capturedAt);
            if (total !== null) {
                lines.push("", "🔔 Jami eslatmalar:", String(total));
            }
        }
    }
    else {
        lines.push("", "📅 Sana:", (0, timezone_1.formatLongDate)(reminder.date, reminder.timezone));
        lines.push("", "🕐 Vaqti:", reminder.time ?? "—");
        lines.push("", "🌍 Vaqt mintaqasi:", reminder.timezone);
    }
    lines.push("", "Barchasi to'g'rimi?");
    return lines.join("\n");
}
function buildCreatedMessage(reminder) {
    if (reminder.reminderType === "recurring") {
        const until = reminder.endDate
            ? `\n${(0, timezone_1.formatLongDate)(reminder.endDate, reminder.timezone)} sanasigacha.`
            : ".";
        return `✅ Eslatma yaratildi!\n\nSizga ${(reminder.recurrenceText ?? "belgilangan tartibda").toLowerCase()} soat ${reminder.time} da eslatib turaman${until}`;
    }
    return `✅ Eslatma yaratildi!\n\nSizga ${(0, timezone_1.formatLongDate)(reminder.date, reminder.timezone)} kuni soat ${reminder.time} da eslataman.`;
}
function logReminder(event, data) {
    if (data) {
        console.log(`[REMINDER] ${event}`, JSON.stringify(data));
    }
    else {
        console.log(`[REMINDER] ${event}`);
    }
}
