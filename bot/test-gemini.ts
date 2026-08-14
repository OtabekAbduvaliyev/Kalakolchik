import { GoogleGenAI } from "@google/genai";
import { env } from "./src/config/env";

async function run() {
  console.log("Using API Key:", env.GEMINI_API_KEY.substring(0, 10) + "...");
  const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  
  try {
    const models = await ai.models.list();
    console.log("Available models:");
    for (const model of models) {
      console.log(`- ${model.name}`);
    }
  } catch (err) {
    console.error("Failed to list models:", err);
  }
}

run();
