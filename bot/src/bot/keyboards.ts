import { InlineKeyboard } from "grammy";

export function buildReminderTypeKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("🕒 Bir martalik", "type_onetime")
    .text("🔄 Davriy (takrorlanuvchi)", "type_cycle");
}

export function buildOneTimeKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("1 kundan keyin", "remind_1d")
    .text("3 kundan keyin", "remind_3d")
    .text("5 kundan keyin", "remind_5d")
    .row()
    .text("✏️ Boshqa sana", "remind_custom");
}

export function buildStopCycleKeyboard(cycles: any[]): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  cycles.forEach((cycle, index) => {
    const noteText = cycle.content_text || "Izohsiz";
    const truncatedNote = noteText.length > 20 ? noteText.substring(0, 20) + "..." : noteText;
    const buttonLabel = `🛑 ${truncatedNote}`;
    const callbackData = `stop_${cycle.reminder_id}`;

    keyboard.text(buttonLabel, callbackData);

    if ((index + 1) % 2 === 0 && index < cycles.length - 1) {
      keyboard.row();
    }
  });

  return keyboard;
}

export function buildVoiceConfirmKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("✅ Tasdiqlash", "voice_confirm")
    .text("✏️ O'zgartirish", "voice_edit")
    .text("❌ Bekor qilish", "voice_cancel");
}

export function buildTimeKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("08:00", "time_08:00")
    .text("13:00", "time_13:00")
    .text("18:00", "time_18:00")
    .row()
    .text("20:00", "time_20:00")
    .text("21:00", "time_21:00")
    .text("Boshqa vaqt", "time_custom");
}

export function buildEditChoiceKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("🎯 Harakat / Izoh", "edit_field_action")
    .text("📅 Sana", "edit_field_date")
    .row()
    .text("🕐 Vaqt", "edit_field_time")
    .text("🔁 Takrorlanish", "edit_field_frequency")
    .row()
    .text("⏳ Tugash sanasi", "edit_field_end")
    .text("⬅️ Orqaga", "edit_field_back");
}
