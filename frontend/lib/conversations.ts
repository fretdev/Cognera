/**
 * Conversation + message persistence via Supabase directly from the browser.
 * These are plain data operations (no Gemini, no service_role key needed),
 * so going through the frontend Supabase client with RLS is the right call —
 * users can only ever read/write their own rows.
 */
import { createClient } from "@/lib/supabase/client";

export type Conversation = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

export type DBMessage = {
  role: "user" | "assistant";
  content: string;
  sources: unknown[];
  mode: string | null;
};

// ── Conversations ────────────────────────────────────────────────────────────

export async function createConversation(title: string): Promise<Conversation> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("conversations")
    .insert({ title: title.slice(0, 80), user_id: user!.id })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function listConversations(): Promise<Conversation[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("conversations")
    .select("id, title, created_at, updated_at")
    .order("updated_at", { ascending: false })
    .limit(60);

  if (error) throw error;
  return data || [];
}

export async function deleteConversation(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("conversations")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

// ── Messages ─────────────────────────────────────────────────────────────────

export async function saveMessages(
  conversationId: string,
  userId: string,
  messages: DBMessage[]
): Promise<void> {
  const supabase = createClient();
  const rows = messages.map((m) => ({
    conversation_id: conversationId,
    user_id: userId,
    role: m.role,
    content: m.content,
    sources: m.sources,
    mode: m.mode,
  }));
  const { error } = await supabase.from("messages").insert(rows);
  if (error) throw error;
}

export async function getMessages(conversationId: string): Promise<DBMessage[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("messages")
    .select("role, content, sources, mode")
    .eq("conversation_id", conversationId)
    .order("created_at");

  if (error) throw error;
  return (data || []) as DBMessage[];
}
