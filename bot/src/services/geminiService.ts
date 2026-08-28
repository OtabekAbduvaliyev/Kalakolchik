import { GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "../config/env";
import { ParsedReminder } from "./pendingReminder";
import { DEFAULT_TIMEZONE } from "../utils/timezone";
import { parseRecurrence } from "../utils/dateParser";

export class VoiceParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VoiceParseError";
  }
}

function buildSystemPrompt(nowDate: string, nowTime: string, timezone: string): string {
  return `You are a reminder extraction assistant. The user may speak in Uzbek, Russian, or English (most users speak Uzbek). Extract only information explicitly stated or unambiguously implied by the user's voice instruction.
If the user speaks in Uzbek (e.g. "Ertaga soat 8 da eslat", "Har kuni soat 20:00 da", "Maqolani o'qish"), understand their intent accurately and extract the information.
Never invent a reminder time. Never use the media upload time as the reminder time unless the user explicitly requests the same time as the upload. Resolve relative dates (e.g. "ertaga" -> tomorrow, "bugun" -> today, "indin" / "indinga" -> day after tomorrow) using the supplied current date and timezone. Return structured JSON. Use null for missing values.

Current date: ${nowDate}
Current time: ${nowTime}
Timezone: ${timezone}

Prioritize:
1. User's explicit instruction
2. Explicit date/time
3. Explicit recurrence
4. Explicit end date
5. Never guess critical scheduling information

Return ONLY valid JSON with these keys:
- "note": string | null — the action / note (e.g. "Read this", "Maqolani o'qish", "Vazifa"). Keep the user's language.
- "reminderType": "one_time" | "recurring" | null
- "date": "YYYY-MM-DD" | null — start/one-time date. Resolve "ertaga" (tomorrow), "bugun" (today), etc. using Current date.
- "time": "HH:MM" | null — 24-hour local time. "8 da" / "soat 8 da" → "08:00", "kechki 8 da" / "20:00 da" → "20:00". "kechqurun" without hour is NOT a time — leave time null.
- "timezone": string | null — default "${timezone}" if unspecified
- "intervalMinutes": number | null — har kuni = 1440, har 2 kunda = 2880, har hafta = 10080, kuniga ikki marta = 720
- "recurrenceText": string | null — e.g. "Har kuni", "Har 2 kunda", "Har hafta" (or "Every day" if English)
- "endDate": "YYYY-MM-DD" | null — e.g. "1-sentabrgacha", "7 kun davomida"
- "useUploadTime": boolean — true ONLY if the user explicitly asked for the same time as sending/uploading

Do not default reminderType to recurring. Do not fill time unless stated or unambiguously implied as a clock time.
Example: {"note":"Maqolani o'qish","reminderType":"recurring","date":null,"time":"20:00","timezone":"${timezone}","intervalMinutes":1440,"recurrenceText":"Har kuni","endDate":"2026-09-01","useUploadTime":false}`;
}

const MODEL_FALLBACK_CHAIN = [
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-3.5-flash",
  "gemini-3.6-flash",
];

async function tryModel(
  apiKey: string,
  modelName: string,
  base64Audio: string,
  mimeType: string,
  prompt: string
): Promise<string> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json",
    },
  });

  const result = await model.generateContent([
    {
      inlineData: {
        data: base64Audio,
        mimeType,
      },
    },
    prompt,
  ]);

  const text = result.response.text()?.trim();
  if (!text) throw new VoiceParseError("Gemini returned an empty response.");
  return text;
}

function nullishString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === "null") return null;
  return trimmed;
}

function nullishNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value === "string" && value.trim() && !Number.isNaN(Number(value))) {
    const n = Number(value);
    return n > 0 ? n : null;
  }
  return null;
}

function normalizeParsed(raw: Record<string, unknown>, fallbackTz: string): ParsedReminder {
  const reminderTypeRaw = nullishString(raw.reminderType) ?? nullishString(raw.type);
  let reminderType: ParsedReminder["reminderType"] = null;
  if (reminderTypeRaw === "one_time" || reminderTypeRaw === "onetime") reminderType = "one_time";
  if (reminderTypeRaw === "recurring" || reminderTypeRaw === "cycle") reminderType = "recurring";

  let time = nullishString(raw.time);
  if (time && /evening|night|morning|afternoon/i.test(time) && !/\d/.test(time)) {
    time = null;
  }

  let intervalMinutes = nullishNumber(raw.intervalMinutes);
  let recurrenceText = nullishString(raw.recurrenceText) ?? nullishString(raw.interval_details);

  if (!intervalMinutes && recurrenceText) {
    const rec = parseRecurrence(recurrenceText);
    if (rec) {
      intervalMinutes = rec.intervalMinutes;
      recurrenceText = rec.recurrenceText;
    }
  }

  const useUploadTime = raw.useUploadTime === true;

  return {
    note: nullishString(raw.note),
    reminderType,
    date: nullishString(raw.date),
    time: useUploadTime ? null : time,
    timezone: nullishString(raw.timezone) ?? fallbackTz,
    intervalMinutes,
    recurrenceText,
    endDate: nullishString(raw.endDate),
    useUploadTime,
  };
}

export async function parseVoiceNote(
  audioBuffer: Buffer,
  mimeType: string = "audio/ogg",
  context: { date: string; time: string; timezone?: string } = {
    date: "",
    time: "",
    timezone: DEFAULT_TIMEZONE,
  }
): Promise<ParsedReminder> {
  if (!env.GEMINI_API_KEY) {
    throw new VoiceParseError("GEMINI_API_KEY is not set in .env file.");
  }

  const timezone = context.timezone || DEFAULT_TIMEZONE;
  const prompt = buildSystemPrompt(context.date, context.time, timezone);
  const base64Audio = audioBuffer.toString("base64");
  let lastError: unknown;

  for (const modelName of MODEL_FALLBACK_CHAIN) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        console.log(`[geminiService] Trying model: ${modelName} (attempt ${attempt})`);
        const rawText = await tryModel(env.GEMINI_API_KEY, modelName, base64Audio, mimeType, prompt);

        let parsed: unknown;
        try {
          const cleaned = rawText.replace(/^```json\s*|```$/g, "").trim();
          parsed = JSON.parse(cleaned);
        } catch {
          throw new VoiceParseError(
            `Failed to parse Gemini JSON response: ${rawText.slice(0, 200)}`
          );
        }

        if (typeof parsed !== "object" || parsed === null) {
          throw new VoiceParseError(`Gemini response was not an object: ${rawText.slice(0, 200)}`);
        }

        const normalized = normalizeParsed(parsed as Record<string, unknown>, timezone);
        console.log(`[geminiService] Success with model: ${modelName}`);
        return normalized;
      } catch (err: any) {
        lastError = err;
        const status = err?.status ?? 0;

        if (status === 503 && attempt === 1) {
          console.warn(`[geminiService] ${modelName} is overloaded (503), retrying in 2s...`);
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }

        if (status === 404 || status === 400) {
          console.warn(`[geminiService] ${modelName} not available (${status}), trying next model...`);
          break;
        }

        console.warn(`[geminiService] ${modelName} failed (${status}): ${err?.message?.slice(0, 100)}`);
        break;
      }
    }
  }

  console.error("[geminiService] All models failed. Last error:", lastError);
  throw new VoiceParseError(
    "All Gemini models are currently unavailable. Please try again in a moment."
  );
}
