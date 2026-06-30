import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";
import ChatPanel from "@/components/ChatPanel";

export default async function Home() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();

  return (
    <AppShell email={data.user?.email}>
      <ChatPanel />
    </AppShell>
  );
}
