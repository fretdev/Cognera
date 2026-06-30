import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";
import StudyToolsPanel from "@/components/study-tools/StudyToolsPanel";

export default async function StudyToolsPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();

  return (
    <AppShell email={data.user?.email}>
      <StudyToolsPanel />
    </AppShell>
  );
}
