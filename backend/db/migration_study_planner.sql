-- ============================================================
-- Cognera Study Planner Migration
-- Run this in your Supabase SQL Editor (Project -> SQL Editor -> New query)
-- ============================================================

create table if not exists study_planner (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    title text not null,
    description text,
    category text not null default 'study_session', -- 'exam', 'assignment', 'study_session'
    target_timestamp timestamptz,
    duration_minutes int not null default 30,
    is_completed boolean not null default false,
    created_at timestamptz not null default now()
);

-- Enable RLS
alter table study_planner enable row level security;

-- Drop policy if exists then recreate
drop policy if exists "Users manage their own study planner items" on study_planner;

create policy "Users manage their own study planner items" on study_planner
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
