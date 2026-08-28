-- =============================================
-- Migration: Add 'end_date' column to reminders table
-- Run this in your Supabase SQL Editor to update existing tables
-- =============================================

-- Add end_date column for recurring reminder deadlines
ALTER TABLE public.reminders ADD COLUMN IF NOT EXISTS end_date TIMESTAMPTZ;
