import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";
import DocumentsPanel from "@/components/DocumentsPanel";

export default async function DocumentsPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();

  return (
    <AppShell email={data.user?.email}>
      <DocumentsPanel />
    </AppShell>
  );
}
