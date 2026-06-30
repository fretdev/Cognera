import Sidebar from "@/components/Sidebar";

export default function AppShell({
  email,
  children,
}: {
  email?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-bg md:flex-row">
      <Sidebar email={email} />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
