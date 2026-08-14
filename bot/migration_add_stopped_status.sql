-- =============================================
-- Migration: Add 'stopped' status to reminders table
-- Run this in your Supabase SQL Editor to update existing tables
-- =============================================

-- Drop the existing check constraint
ALTER TABLE public.reminders DROP CONSTRAINT IF EXISTS reminders_status_check;

-- Add the updated check constraint that includes 'stopped'
ALTER TABLE public.reminders ADD CONSTRAINT reminders_status_check 
  CHECK (status IN ('pending', 'sent', 'stopped'));