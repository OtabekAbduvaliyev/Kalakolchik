import "dotenv/config";

// ----------------------------------------------------------------
// Validates and exports required environment variables.
// Throws an error at startup if any variable is missing.
// ----------------------------------------------------------------

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(
      `Missing required environment variable: "${key}"\n` +
      `Make sure you have a .env file (copy from .env.example).`
    );
  }
  return value;
}

function cleanSupabaseUrl(url: string): string {
  return url.replace(/\/rest\/v1\/?$/, "").replace(/\/+$/, "");
}

export const env = {
  TELEGRAM_BOT_TOKEN: requireEnv("TELEGRAM_BOT_TOKEN"),
  SUPABASE_URL: cleanSupabaseUrl(requireEnv("SUPABASE_URL")),
  SUPABASE_KEY: requireEnv("SUPABASE_KEY"),
  GEMINI_API_KEY: process.env.GEMINI_API_KEY ?? "",
};
