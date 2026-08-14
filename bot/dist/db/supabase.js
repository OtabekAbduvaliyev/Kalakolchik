"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.supabase = void 0;
const supabase_js_1 = require("@supabase/supabase-js");
const env_1 = require("../config/env");
// ----------------------------------------------------------------
// Single Supabase client instance used across the entire app.
// ----------------------------------------------------------------
exports.supabase = (0, supabase_js_1.createClient)(env_1.env.SUPABASE_URL, env_1.env.SUPABASE_KEY);
