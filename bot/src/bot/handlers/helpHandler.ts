import { CommandContext } from "grammy";
import { BotContext } from "../index";

// ----------------------------------------------------------------
// /help and /about command handler
// Provides a clear guide on how to use Kalakolchik.
// ----------------------------------------------------------------

export async function helpHandler(ctx: CommandContext<BotContext>): Promise<void> {
  const helpText =
`🔔 *Kalakolchik — Eslatmalar va takrorlash boti*

Bot sizga eslab qolish qiyin bo'lgan ma'lumotlarni unutmaslikka yordam beradi.

💡 *Qanday ishlaydi?*
1. *Matn, rasm, video yoki audio yuboring* — Bot uni xotiraga oladi va sizdan qachon eslatishni so'raydi.
2. *🎙️ Ovozli xabar yuboring* — AI (Gemini) ovozingizni tahlil qilib, eslatma vaqtini avtomatik belgilaydi (masalan: *"Ertaga ertalab soat 9 da maqolani o'qishimni eslat"*).
3. *Bir martalik yoki davriy eslatma* — Xohlagan vaqtingizda (masalan, 1 kundan keyin, har kuni soat 20:00 da, yoki aniq sanada).

📋 *Mavjud buyruqlar:*
• /start — Botni ishga tushirish
• /new — Yangi eslatma qo'shish
• /reminders — Faol va rejalashtirilgan eslatmalarni ko'rish
• /stop — Takrorlanuvchi eslatmalarni ko'rish va to'xtatish
• /timezone — Vaqt mintaqasini ko'rish va o'zgartirish
• /cancel — Joriy amalni bekor qilish
• /help — Ushbu qo'llanmani ko'rish

🌍 *Vaqt mintaqasi:*
Odatiy holatda O'zbekiston vaqti (*Asia/Tashkent, UTC+5*) o'rnatilgan. Buni /timezone buyrug'i orqali o'zgartirishingiz mumkin.`;

  await ctx.reply(helpText, { parse_mode: "Markdown" });
}
