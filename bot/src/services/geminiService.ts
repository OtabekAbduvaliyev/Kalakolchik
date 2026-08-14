import { GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "../config/env";

// ----------------------------------------------------------------
// Gemini Service
// Sends a voice audio buffer to Gemini Flash and parses the
// structured JSON response for note and schedule extraction.
// Includes retry logic and a model fallback chain.
// ----------------------------------------------------------------

export interface VoiceParseResult {
  note: string;
  type: "one_time" | "recurring";
  interval_details: string;
}

export class VoiceParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VoiceParseError";
  }
}

const SYSTEM_PROMPT = `You are an AI assistant for a spaced repetition memory bot.
Analyze the user's voice recording and extract two things:
1. "note": A clean transcript or summary of what the user wants to remember. Keep it concise and clear.
2. "type": Either "one_time" or "recurring".
   - Use "one_time" if the user mentions a specific date or a single future reminder.
   - Use "recurring" if the user mentions a repeating frequency (e.g., "every day", "twice a week").
3. "interval_details": The target dates or frequency extracted from the audio.
   - For "one_time": provide a date string like "DD/MM/YYYY" or "in X days".
   - For "recurring": provide a frequency string like "every 1 day", "every 2 hours", "every 3 days".

If you cannot determine the schedule, use "recurring" with "interval_details": "every 1 day" as a safe default.
Return ONLY valid JSON with no markdown fences, no extra text.
Example: {"note":"Review flashcards","type":"recurring","interval_details":"every 1 day"}`;

// Models to try in order (most stable first)
const MODEL_FALLBACK_CHAIN = [
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-3.5-flash",
  "gemini-3.6-flash",
];

/**
 * Attempts a single Gemini API call with the given model.
 * Throws the original error so the caller can decide to retry or fallback.
 */
async function tryModel(
  apiKey: string,
  modelName: string,
  base64Audio: string,
  mimeType: string
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
    SYSTEM_PROMPT,
  ]);

  const text = result.response.text()?.trim();
  if (!text) throw new VoiceParseError("Gemini returned an empty response.");
  return text;
}

/**
 * Sends a voice audio buffer to Gemini Flash and returns structured parse results.
 * Tries each model in the fallback chain. Retries 503 (overloaded) errors once.
 */
export async function parseVoiceNote(
  audioBuffer: Buffer,
  mimeType: string = "audio/ogg"
): Promise<VoiceParseResult> {
  if (!env.GEMINI_API_KEY) {
    throw new VoiceParseError("GEMINI_API_KEY is not set in .env file.");
  }

  const base64Audio = audioBuffer.toString("base64");
  let lastError: unknown;

  for (const modelName of MODEL_FALLBACK_CHAIN) {
    // Try each model up to 2 times (once for 503 retry)
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        console.log(`[geminiService] Trying model: ${modelName} (attempt ${attempt})`);
        const rawText = await tryModel(env.GEMINI_API_KEY, modelName, base64Audio, mimeType);

        // --- Parse and validate JSON ---
        let parsed: unknown;
        try {
          const cleaned = rawText.replace(/^```json\s*|```$/g, "").trim();
          parsed = JSON.parse(cleaned);
        } catch {
          throw new VoiceParseError(
            `Failed to parse Gemini JSON response: ${rawText.slice(0, 200)}`
          );
        }

        if (
          typeof parsed !== "object" ||
          parsed === null ||
          typeof (parsed as any).note !== "string" ||
          !["one_time", "recurring"].includes((parsed as any).type) ||
          typeof (parsed as any).interval_details !== "string"
        ) {
          throw new VoiceParseError(
            `Gemini response missing required fields: ${rawText.slice(0, 200)}`
          );
        }

        console.log(`[geminiService] Success with model: ${modelName}`);
        return parsed as VoiceParseResult;

      } catch (err: any) {
        lastError = err;
        const status = err?.status ?? 0;

        if (status === 503 && attempt === 1) {
          // 503 = model overloaded: wait 2 seconds and retry once
          console.warn(`[geminiService] ${modelName} is overloaded (503), retrying in 2s...`);
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }

        if (status === 404 || status === 400) {
          // 404 = model not available for this key: skip to next model
          console.warn(`[geminiService] ${modelName} not available (${status}), trying next model...`);
          break; // break inner loop, try next model
        }

        // For other errors, break inner and try next model
        console.warn(`[geminiService] ${modelName} failed (${status}): ${err?.message?.slice(0, 100)}`);
        break;
      }
    }
  }

  // All models failed
  console.error("[geminiService] All models failed. Last error:", lastError);
  throw new VoiceParseError(
    "All Gemini models are currently unavailable. Please try again in a moment."
  );
}


