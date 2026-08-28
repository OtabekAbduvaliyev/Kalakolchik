-- =============================================
-- Kalakolchik Bot — Supabase Database Schema
-- Run this script in the Supabase SQL Editor
-- =============================================

-- -------------------------
-- Table: users
-- -------------------------
CREATE TABLE IF NOT EXISTS public.users (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id BIGINT      UNIQUE NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -------------------------
-- Table: memories
-- -------------------------
CREATE TABLE IF NOT EXISTS public.memories (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  media_type   TEXT        NOT NULL CHECK (media_type IN ('image', 'video', 'text')),
  media_url    TEXT,
  content_text TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -------------------------
-- Table: reminders
-- -------------------------
CREATE TABLE IF NOT EXISTS public.reminders (
  id                         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id                  UUID        NOT NULL REFERENCES public.memories(id) ON DELETE CASCADE,
  scheduled_at               TIMESTAMPTZ NOT NULL,
  is_recurring               BOOLEAN     NOT NULL DEFAULT FALSE,
  recurring_interval_minutes INTEGER,
  end_date                   TIMESTAMPTZ,
  status                     TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'stopped')),
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -------------------------
-- Migration: Add 'stopped' status to existing reminders table
-- Run this if your table already exists without the 'stopped' status
-- -------------------------
-- First, drop the existing check constraint
ALTER TABLE public.reminders DROP CONSTRAINT IF EXISTS reminders_status_check;

-- Add the updated check constraint that includes 'stopped'
ALTER TABLE public.reminders ADD CONSTRAINT reminders_status_check 
  CHECK (status IN ('pending', 'sent', 'stopped'));

-- -------------------------
-- Indexes for performance
-- -------------------------
CREATE INDEX IF NOT EXISTS idx_memories_user_id ON public.memories(user_id);
CREATE INDEX IF NOT EXISTS idx_reminders_status_scheduled ON public.reminders(status, scheduled_at) WHERE status = 'pending';

-- -------------------------
-- Row Level Security (RLS) Fixes
-- Disable RLS on tables so anon/bot client can read & write
-- -------------------------
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.memories DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminders DISABLE ROW LEVEL SECURITY;

-- -------------------------
-- Storage Bucket Setup & Policies
-- Create public bucket 'memories' and allow insert/select
-- -------------------------
INSERT INTO storage.buckets (id, name, public) 
VALUES ('memories', 'memories', true) 
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Allow public upload to memories" ON storage.objects;
CREATE POLICY "Allow public upload to memories" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'memories');

DROP POLICY IF EXISTS "Allow public select from memories" ON storage.objects;
CREATE POLICY "Allow public select from memories" ON storage.objects FOR SELECT USING (bucket_id = 'memories');
