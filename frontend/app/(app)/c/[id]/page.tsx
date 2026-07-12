import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ChatPanel from "@/components/ChatPanel";

type Params = { id: string };

export default async function ConversationPage({
  params,
}: {
  params: Params;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Verify this conversation exists and belongs to the current user.
  const { data: conversation } = await supabase
    .from("conversations")
    .select("id, title")
    .eq("id", params.id)
    .eq("user_id", user!.id)
    .single();

  if (!conversation) notFound();

  const { data: rows } = await supabase
    .from("messages")
    .select("role, content, sources, mode")
    .eq("conversation_id", params.id)
    .order("created_at");

  const initialMessages = (rows || []).map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
    sources: (m.sources as []) || [],
    mode: m.mode as "grounded" | "general" | undefined,
  }));

  return (
    <ChatPanel
      conversationId={params.id}
      initialMessages={initialMessages}
    />
  );
}
