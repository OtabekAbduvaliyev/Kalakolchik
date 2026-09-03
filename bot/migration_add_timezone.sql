-- =============================================
-- Migration: Add 'timezone' column to users table
-- Run this in your Supabase SQL Editor to support per-user timezones
-- =============================================

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'Asia/Tashkent';
