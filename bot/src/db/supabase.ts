import { createClient } from "@supabase/supabase-js";
import { env } from "../config/env";

// ----------------------------------------------------------------
// Single Supabase client instance used across the entire app.
// ----------------------------------------------------------------

export const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);
