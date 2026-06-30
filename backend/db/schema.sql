-- Run this once in the Supabase SQL Editor (Project -> SQL Editor -> New query)
-- Requires the "vector" extension enabled (Database -> Extensions -> vector)

create extension if not exists vector;

-- ============================================================
-- Documents the user has uploaded (for RAG + summarization)
-- ============================================================
create table if not exists documents (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    title text not null,
    storage_path text not null,       -- path in the Supabase Storage bucket
    summary text,                     -- filled in once summarized
    created_at timestamptz not null default now()
);

-- ============================================================
-- Chunked + embedded text from documents, for RAG retrieval
-- ============================================================
create table if not exists document_chunks (
    id uuid primary key default gen_random_uuid(),
    document_id uuid not null references documents(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    content text not null,
    chunk_index int not null,
    embedding vector(768),            -- adjust dimension to match the embedding model used
    created_at timestamptz not null default now()
);

-- HNSW index for fast similarity search at this table's scale
create index if not exists document_chunks_embedding_idx
    on document_chunks using hnsw (embedding vector_cosine_ops);

-- ============================================================
-- Auto-generated flashcards / quiz questions
-- ============================================================
create table if not exists flashcards (
    id uuid primary key default gen_random_uuid(),
    document_id uuid references documents(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    question text not null,
    answer text not null,
    created_at timestamptz not null default now()
);

create table if not exists quiz_questions (
    id uuid primary key default gen_random_uuid(),
    document_id uuid references documents(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    question text not null,
    options jsonb not null,           -- e.g. ["A) ...", "B) ...", "C) ...", "D) ..."]
    correct_option int not null,      -- index into options
    created_at timestamptz not null default now()
);

-- ============================================================
-- Study planner
-- ============================================================
create table if not exists study_sessions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    title text not null,
    notes text,
    scheduled_for timestamptz not null,
    duration_minutes int not null default 30,
    completed boolean not null default false,
    created_at timestamptz not null default now()
);

-- ============================================================
-- Similarity search for RAG retrieval
-- ============================================================
-- pgvector's <=> operator can't be called directly through PostgREST,
-- so chat retrieval goes through this function instead. Returns the
-- top N most similar chunks for a given user, ranked by cosine distance.
create or replace function match_document_chunks(
    query_embedding vector(768),
    match_user_id uuid,
    match_count int default 5
)
returns table (
    id uuid,
    document_id uuid,
    content text,
    similarity float,
    document_title text
)
language sql stable
as $$
    select
        document_chunks.id,
        document_chunks.document_id,
        document_chunks.content,
        1 - (document_chunks.embedding <=> query_embedding) as similarity,
        documents.title as document_title
    from document_chunks
    join documents on documents.id = document_chunks.document_id
    where document_chunks.user_id = match_user_id
    order by document_chunks.embedding <=> query_embedding
    limit match_count;
$$;

alter table documents enable row level security;
alter table document_chunks enable row level security;
alter table flashcards enable row level security;
alter table quiz_questions enable row level security;
alter table study_sessions enable row level security;

create policy "Users manage their own documents" on documents
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage their own chunks" on document_chunks
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage their own flashcards" on flashcards
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage their own quiz questions" on quiz_questions
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage their own study sessions" on study_sessions
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Note: the backend connects with the service_role key, which bypasses RLS
-- by design (it's trusted server-side code). RLS here protects against any
-- future direct-from-frontend Supabase access using the anon key.
