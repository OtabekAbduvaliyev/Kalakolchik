"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.continueReminderCollection = continueReminderCollection;
exports.savePendingReminder = savePendingReminder;
exports.handleReminderCallback = handleReminderCallback;
exports.handleReminderText = handleReminderText;
const userService_1 = require("../../services/userService");
const memoryService_1 = require("../../services/memoryService");
const reminderService_1 = require("../../services/reminderService");
const pendingReminder_1 = require("../../services/pendingReminder");
const keyboards_1 = require("../keyboards");
const dateParser_1 = require("../../utils/dateParser");
const timezone_1 = require("../../utils/timezone");
function dbMediaType(mediaType) {
    return mediaType === "voice" ? "text" : mediaType;
}
async function continueReminderCollection(ctx) {
    const pending = ctx.session.pending;
    if (!pending?.reminder)
        return;
    pending.reminder = (0, pendingReminder_1.applyCapturedTimeIfRequested)(pending.reminder, pending.capturedAt);
    const missing = (0, pendingReminder_1.getMissingFields)(pending.reminder);
    (0, pendingReminder_1.logReminder)("Missing fields:", { missing });
    if (missing.length === 0) {
        await showPreview(ctx);
        return;
    }
    await askForMissing(ctx, missing[0]);
}
async function askForMissing(ctx, field) {
    const pending = ctx.session.pending;
    if (!pending)
        return;
    if (field === "note") {
        pending.step = "awaiting_missing_note";
        (0, pendingReminder_1.logReminder)("Asking user for action/note");
        await ctx.reply("Sizga buni nima deb eslatishim kerak? (masalan: “Maqolani o'qish” yoki vazifa nomi)");
        return;
    }
    if (field === "reminderType") {
        pending.step = "awaiting_missing_type";
        (0, pendingReminder_1.logReminder)("Asking user for reminder type");
        await ctx.reply("Bu bir martalik eslatma bo'lsinmi yoki takrorlanuvchi?", {
            reply_markup: (0, keyboards_1.buildReminderTypeKeyboard)(),
        });
        return;
    }
    if (field === "date") {
        pending.step = "awaiting_missing_date";
        (0, pendingReminder_1.logReminder)("Asking user for date");
        await ctx.reply("Qaysi sanada eslatay? `KK/OO/YYYY` yoki `YYYY-MM-DD` ko'rinishida yozing.", {
            parse_mode: "Markdown",
        });
        return;
    }
    if (field === "time") {
        pending.step = "awaiting_missing_time";
        (0, pendingReminder_1.logReminder)("Asking user for time");
        const recurring = pending.reminder?.reminderType === "recurring";
        const question = recurring
            ? `Soat nechida eslatay${pending.reminder?.recurrenceText ? ` (${pending.reminder.recurrenceText.toLowerCase()})` : " har kuni"}?`
            : "Soat nechida eslatay?";
        await ctx.reply(question, {
            reply_markup: (0, keyboards_1.buildTimeKeyboard)(),
        });
        return;
    }
    pending.step = "awaiting_missing_frequency";
    (0, pendingReminder_1.logReminder)("Asking user for frequency");
    await ctx.reply("Qanchalik tez-tez takrorlansin? Masalan: har kuni, har 2 kunda, har hafta.");
}
async function showPreview(ctx) {
    const pending = ctx.session.pending;
    if (!pending?.reminder)
        return;
    const text = (0, pendingReminder_1.buildPreviewText)({
        mediaType: pending.mediaType,
        reminder: pending.reminder,
        capturedAt: pending.capturedAt,
        initialText: pending.initialText,
    });
    const scheduled = (0, pendingReminder_1.computeScheduledAt)(pending.reminder, pending.capturedAt);
    if (!text || !scheduled) {
        (0, pendingReminder_1.logReminder)("Final reminder invalid after validation");
        await ctx.reply("Kiritilgan ma'lumotlar bo'yicha eslatma vaqtini belgilab bo'lmadi (sana yoki vaqt o'tib ketgan bo'lishi mumkin). Iltimos, qaytadan yuboring.");
        return;
    }
    (0, pendingReminder_1.logReminder)("Final reminder:", {
        reminderType: pending.reminder.reminderType,
        date: pending.reminder.date,
        time: pending.reminder.time,
        timezone: pending.reminder.timezone,
        recurrenceText: pending.reminder.recurrenceText,
        intervalMinutes: pending.reminder.intervalMinutes,
        endDate: pending.reminder.endDate,
        scheduledAt: scheduled.toISOString(),
    });
    pending.step = "awaiting_voice_confirm";
    await ctx.reply(text, { reply_markup: (0, keyboards_1.buildVoiceConfirmKeyboard)() });
}
async function savePendingReminder(ctx, telegramId) {
    const pending = ctx.session.pending;
    if (!pending?.reminder)
        return false;
    const reminder = (0, pendingReminder_1.applyCapturedTimeIfRequested)(pending.reminder, pending.capturedAt);
    const missing = (0, pendingReminder_1.getMissingFields)(reminder);
    if (missing.length > 0)
        return false;
    const scheduledAt = (0, pendingReminder_1.computeScheduledAt)(reminder, pending.capturedAt);
    if (!scheduledAt)
        return false;
    let contentText = reminder.note ?? pending.noteText ?? "";
    if (pending.initialText) {
        if (contentText && contentText !== pending.initialText) {
            contentText = `${pending.initialText}\n\n🎯 **Harakat / Vazifa:** ${contentText}`;
        }
        else {
            contentText = pending.initialText;
        }
    }
    const userId = await (0, userService_1.upsertUser)(telegramId);
    const memory = await (0, memoryService_1.createMemory)({
        userId,
        mediaType: dbMediaType(pending.mediaType),
        mediaUrl: pending.mediaUrl,
        contentText: contentText || undefined,
    });
    await (0, reminderService_1.createReminder)(memory.id, scheduledAt, reminder.reminderType === "recurring", reminder.intervalMinutes, reminder.endDate);
    return true;
}
async function handleReminderCallback(ctx) {
    const data = ctx.callbackQuery.data;
    const pending = ctx.session.pending;
    if (!pending?.reminder || !data)
        return false;
    const step = pending.step;
    if (step === "awaiting_voice_confirm") {
        if (data === "voice_confirm") {
            const telegramId = ctx.from?.id;
            if (!telegramId)
                return true;
            (0, pendingReminder_1.logReminder)("User confirmed");
            try {
                const ok = await savePendingReminder(ctx, telegramId);
                if (!ok) {
                    await ctx.reply("⚠️ Eslatmani saqlab bo'lmadi. Iltimos, ma'lumotlarni tekshirib qaytadan urinib ko'ring.");
                    return true;
                }
                const message = (0, pendingReminder_1.buildCreatedMessage)(pending.reminder);
                ctx.session.pending = undefined;
                (0, pendingReminder_1.logReminder)("Reminder created");
                await ctx.reply(message);
            }
            catch (err) {
                console.error("[REMINDER] Save failed:", err);
                await ctx.reply("❌ Eslatmani saqlashda xatolik yuz berdi. Iltimos, qaytadan urinib ko'ring.");
            }
            return true;
        }
        if (data === "voice_edit") {
            pending.step = "awaiting_edit_choice";
            await ctx.reply("Nimani o'zgartirmoqchisiz?", {
                reply_markup: (0, keyboards_1.buildEditChoiceKeyboard)(),
            });
            return true;
        }
        if (data === "voice_cancel") {
            ctx.session.pending = undefined;
            await ctx.reply("Bekor qilindi. Eslatma yaratish uchun xabar yoki fayl yuborishingiz mumkin.");
            return true;
        }
        return false;
    }
    if (step === "awaiting_missing_type" || step === "awaiting_edit_choice") {
        if (data === "type_onetime" || data === "type_cycle") {
            pending.reminder.reminderType = data === "type_onetime" ? "one_time" : "recurring";
            if (data === "type_cycle" && !pending.reminder.intervalMinutes) {
                pending.reminder.recurrenceText = null;
            }
            if (data === "type_onetime") {
                pending.reminder.intervalMinutes = null;
                pending.reminder.recurrenceText = null;
                pending.reminder.endDate = null;
            }
            await continueReminderCollection(ctx);
            return true;
        }
    }
    if (step === "awaiting_missing_time" || step === "awaiting_edit_time") {
        if (data === "time_custom") {
            await ctx.reply("Vaqtni `20:00` yoki `8:00` ko'rinishida yuboring.", { parse_mode: "Markdown" });
            return true;
        }
        const timeMatch = data.match(/^time_(\d{2}:\d{2})$/);
        if (timeMatch) {
            pending.reminder.time = timeMatch[1];
            pending.reminder.useCapturedTime = false;
            await continueReminderCollection(ctx);
            return true;
        }
    }
    if (step === "awaiting_edit_choice") {
        if (data === "edit_field_back") {
            await showPreview(ctx);
            return true;
        }
        if (data === "edit_field_action") {
            pending.step = "awaiting_edit_action";
            await ctx.reply("Eslatma uchun yangi harakat yoki izohni yuboring.");
            return true;
        }
        if (data === "edit_field_date") {
            pending.step = "awaiting_edit_date";
            await ctx.reply("Yangi sanani yuboring (`KK/OO/YYYY` yoki `YYYY-MM-DD`).", { parse_mode: "Markdown" });
            return true;
        }
        if (data === "edit_field_time") {
            pending.step = "awaiting_edit_time";
            await ctx.reply("Soat nechida eslatay?", { reply_markup: (0, keyboards_1.buildTimeKeyboard)() });
            return true;
        }
        if (data === "edit_field_frequency") {
            pending.step = "awaiting_edit_frequency";
            await ctx.reply("Qanchalik tez-tez takrorlansin? Masalan: har kuni, har 2 kunda.");
            return true;
        }
        if (data === "edit_field_end") {
            pending.step = "awaiting_edit_end_date";
            await ctx.reply("Tugash sanasini (`KK/OO/YYYY`) yuboring yoki o'chirish uchun `yo'q` deb yozing.", {
                parse_mode: "Markdown",
            });
            return true;
        }
    }
    return false;
}
async function handleReminderText(ctx) {
    const pending = ctx.session.pending;
    if (!pending?.reminder)
        return false;
    const text = ctx.message?.text?.trim();
    if (!text)
        return false;
    const step = pending.step;
    const tz = pending.reminder.timezone;
    const today = (0, timezone_1.todayInTimeZone)(tz);
    if (step === "awaiting_missing_note" || step === "awaiting_edit_action") {
        pending.reminder.note = text;
        pending.noteText = text;
        await continueReminderCollection(ctx);
        return true;
    }
    if (step === "awaiting_missing_date" || step === "awaiting_edit_date") {
        const ymd = (0, dateParser_1.parseFlexibleDateYmd)(text, today);
        if (!ymd) {
            await ctx.reply("❌ Sanani aniqlab bo'lmadi. Masalan: `DD/MM/YYYY` (kun/oy/yil) yoki `1 sentabr` ko'rinishida yozing.", {
                parse_mode: "Markdown",
            });
            return true;
        }
        pending.reminder.date = ymd;
        await continueReminderCollection(ctx);
        return true;
    }
    if (step === "awaiting_missing_time" || step === "awaiting_edit_time") {
        const time = (0, dateParser_1.parseClockTime)(text);
        if (!time) {
            await ctx.reply("❌ Vaqtni aniqlab bo'lmadi. Masalan: `20:00` yoki `8:00` ko'rinishida yozing.", {
                parse_mode: "Markdown",
            });
            return true;
        }
        pending.reminder.time = time;
        pending.reminder.useCapturedTime = false;
        await continueReminderCollection(ctx);
        return true;
    }
    if (step === "awaiting_missing_frequency" || step === "awaiting_edit_frequency") {
        const rec = (0, dateParser_1.parseRecurrence)(text);
        if (!rec) {
            await ctx.reply("❌ Takrorlanish oralig'ini tushunmadim. Masalan: “har kuni” yoki “har 2 kunda” deb yozing.");
            return true;
        }
        pending.reminder.reminderType = "recurring";
        pending.reminder.intervalMinutes = rec.intervalMinutes;
        pending.reminder.recurrenceText = rec.recurrenceText;
        await continueReminderCollection(ctx);
        return true;
    }
    if (step === "awaiting_edit_end_date") {
        if (/^(none|no|clear|remove|yo'q|yoq|bekor)$/i.test(text)) {
            pending.reminder.endDate = null;
            await continueReminderCollection(ctx);
            return true;
        }
        const ymd = (0, dateParser_1.parseFlexibleDateYmd)(text, today);
        if (!ymd) {
            await ctx.reply("❌ Tugash sanasini aniqlab bo'lmadi. Masalan: `DD/MM/YYYY` yoki `yo'q` deb yozing.", {
                parse_mode: "Markdown",
            });
            return true;
        }
        pending.reminder.endDate = ymd;
        await continueReminderCollection(ctx);
        return true;
    }
    return false;
}
