import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";

export default async function PlannerPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();

  return (
    <AppShell email={data.user?.email}>
      <div className="mx-auto max-w-2xl px-6 py-10">
        <h1 className="text-2xl font-semibold">Planner</h1>
        <p className="mt-2 text-sm text-muted">
          Coming next — schedule study sessions around your deadlines.
        </p>
      </div>
    </AppShell>
  );
}
