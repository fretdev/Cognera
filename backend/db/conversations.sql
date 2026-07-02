-- Run this in the Supabase SQL Editor (Project → SQL Editor → New query)

-- ============================================================
-- Conversations (one per chat session)
-- ============================================================
create table if not exists conversations (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    title text not null default 'New conversation',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- ============================================================
-- Messages (one per turn, both user and assistant)
-- ============================================================
create table if not exists messages (
    id uuid primary key default gen_random_uuid(),
    conversation_id uuid not null references conversations(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    role text not null check (role in ('user', 'assistant')),
    content text not null,
    sources jsonb not null default '[]'::jsonb,
    mode text,
    created_at timestamptz not null default now()
);

-- Auto-bump conversations.updated_at whenever a message is inserted so we
-- can order the sidebar list by most-recently-active conversation.
create or replace function update_conversation_timestamp()
returns trigger language plpgsql as $$
begin
    update conversations set updated_at = now() where id = new.conversation_id;
    return new;
end;
$$;

drop trigger if exists on_message_insert on messages;
create trigger on_message_insert
    after insert on messages
    for each row execute procedure update_conversation_timestamp();

-- ============================================================
-- Row Level Security
-- ============================================================
alter table conversations enable row level security;
alter table messages enable row level security;

create policy "Users manage their own conversations" on conversations
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage their own messages" on messages
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
