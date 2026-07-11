import Sidebar from "@/components/Sidebar";

export default function AppShell({
  email,
  children,
}: {
  email?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div
      className="flex h-screen flex-col overflow-hidden md:flex-row"
      style={{ background: "var(--bg)" }}
    >
      <Sidebar email={email} />
      <main
        className="flex-1 overflow-y-auto"
        style={{ background: "var(--bg)" }}
      >
        {children}
      </main>
    </div>
  );
}
