-- ============================================================
-- STORAGE LIFECYCLE MANAGEMENT
-- Run once in Supabase SQL Editor.
--
-- Strategy:
--   Documents not accessed for 90 days are automatically deleted —
--   both the DB row (which cascades to chunks/flashcards/quizzes)
--   and the file in Supabase Storage.
--
--   "Accessed" = used in a chat query (last_accessed_at is updated
--   by the /chat/stream endpoint whenever a document's chunks are
--   retrieved). Uploading a document also counts as access.
-- ============================================================
-- 1. Add last_accessed_at column if it doesn't exist
ALTER TABLE documents
ADD COLUMN IF NOT EXISTS last_accessed_at timestamptz NOT NULL DEFAULT now();
-- 2. Enable pg_cron extension (available on Supabase free tier)
CREATE EXTENSION IF NOT EXISTS pg_cron;
-- 3. Schedule daily cleanup at 02:00 UTC
--    Deletes documents not accessed in the past 90 days.
--    The storage file must be deleted separately via a Supabase
--    Edge Function (see note below) — this handles the DB side.
SELECT cron.schedule(
    'cognera-document-cleanup',
    -- job name~
    '0 2 * * *',
    -- every day at 02:00 UTC
    $$
    DELETE FROM documents
    WHERE last_accessed_at < now() - INTERVAL '90 days';
$$
);
-- 4. Helper function — manually run cleanup anytime
CREATE OR REPLACE FUNCTION run_document_cleanup() RETURNS TABLE(deleted_count bigint) LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
DELETE FROM documents
WHERE last_accessed_at < now() - INTERVAL '90 days';
GET DIAGNOSTICS n = ROW_COUNT;
RETURN QUERY
SELECT n;
END;
$$;
-- ============================================================
-- NOTE ON STORAGE FILE DELETION
-- The pg_cron job above deletes the database rows. The actual
-- files in Supabase Storage are NOT deleted by SQL alone.
--
-- To also delete the storage files, create a Supabase Edge
-- Function that:
--   1. Queries documents WHERE last_accessed_at < now() - 90 days
--   2. Calls supabase.storage.from('documents').remove([paths])
--   3. Then deletes the DB rows
--
-- For a student project at current scale, the pg_cron job is
-- sufficient — Supabase's 1GB free storage is generous and the
-- DB cleanup prevents further chunk/embedding accumulation.
-- Revisit when approaching 800MB storage usage.
-- ============================================================