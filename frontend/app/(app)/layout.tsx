import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";

// This layout wraps every protected page (/, /documents, /study-tools, /planner).
// By fetching auth here once, child pages don't each need their own auth
// check + AppShell — they just export their content component directly.
// This is what eliminates the per-navigation auth delay.
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();

  return <AppShell email={data.user?.email}>{children}</AppShell>;
}
