-- Run this in Supabase SQL Editor → New query → Run
-- Fixes the parameter type so Python can pass a plain float array
-- instead of relying on PostgREST string-to-vector casting which
-- silently returns zero results.

CREATE OR REPLACE FUNCTION match_document_chunks(
    query_embedding  float[],
    match_user_id    uuid,
    match_count      int DEFAULT 8
)
RETURNS TABLE (
    id              uuid,
    document_id     uuid,
    content         text,
    similarity      float,
    document_title  text
)
LANGUAGE sql STABLE AS $$
    SELECT
        dc.id,
        dc.document_id,
        dc.content,
        1 - (dc.embedding <=> query_embedding::vector) AS similarity,
        d.title AS document_title
    FROM document_chunks dc
    JOIN documents d ON d.id = dc.document_id
    WHERE dc.user_id = match_user_id
    ORDER BY dc.embedding <=> query_embedding::vector
    LIMIT match_count;
$$;
