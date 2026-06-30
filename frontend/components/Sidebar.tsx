"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  MessageSquare,
  FileText,
  Layers,
  CalendarClock,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Menu,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { CogneraMark, CogneraWordmark } from "@/components/brand/CogneraLogo";

const NAV_ITEMS = [
  { href: "/", label: "Chat", icon: MessageSquare },
  { href: "/documents", label: "Documents", icon: FileText },
  { href: "/study-tools", label: "Flashcards & Quizzes", icon: Layers },
  { href: "/planner", label: "Planner", icon: CalendarClock },
];

function Logo({ collapsed }: { collapsed?: boolean }) {
  return collapsed ? (
    <CogneraMark size={28} />
  ) : (
    <CogneraWordmark iconSize={28} />
  );
}

function SidebarContent({
  email,
  collapsed,
  onNavigate,
}: {
  email?: string | null;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      <nav className="flex flex-1 flex-col gap-1 px-3 pt-2">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              title={collapsed ? item.label : undefined}
              className={`group flex items-center gap-3 rounded-full px-3 py-2.5 text-sm transition-colors ${
                active
                  ? "bg-surface font-medium text-ink"
                  : "text-muted hover:bg-surface hover:text-ink"
              }`}
            >
              <Icon
                size={18}
                strokeWidth={1.75}
                className={`flex-shrink-0 ${
                  active ? "text-ink" : "text-muted group-hover:text-ink"
                }`}
              />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border px-3 py-3">
        {!collapsed && (
          <p className="truncate px-2 pb-2 text-xs text-muted">{email}</p>
        )}
        <button
          onClick={handleSignOut}
          title={collapsed ? "Sign out" : undefined}
          className="group flex w-full items-center gap-3 rounded-full px-3 py-2.5 text-sm text-muted transition-colors hover:bg-surface hover:text-ink"
        >
          <LogOut
            size={18}
            strokeWidth={1.75}
            className="flex-shrink-0 text-muted group-hover:text-ink"
          />
          {!collapsed && <span>Sign out</span>}
        </button>
      </div>
    </>
  );
}

export default function Sidebar({ email }: { email?: string | null }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={`hidden h-screen flex-shrink-0 flex-col border-r border-border bg-bg transition-all duration-200 md:flex ${
          collapsed ? "w-[68px]" : "w-64"
        }`}
      >
        <div className="flex items-center justify-between px-4 py-5">
          <Logo collapsed={collapsed} />
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="rounded-md p-1.5 text-muted transition-colors hover:bg-surface hover:text-ink"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <PanelLeftOpen size={18} strokeWidth={1.75} />
            ) : (
              <PanelLeftClose size={18} strokeWidth={1.75} />
            )}
          </button>
        </div>
        <SidebarContent email={email} collapsed={collapsed} />
      </aside>

      {/* Mobile top bar */}
      <div className="flex items-center justify-between border-b border-border bg-bg px-4 py-3 md:hidden">
        <Logo />
        <button
          onClick={() => setMobileOpen(true)}
          className="rounded-md p-1.5 text-muted hover:bg-surface hover:text-ink"
          aria-label="Open menu"
        >
          <Menu size={20} strokeWidth={1.75} />
        </button>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute left-0 top-0 flex h-full w-72 flex-col border-r border-border bg-bg">
            <div className="flex items-center justify-between px-4 py-5">
              <Logo />
              <button
                onClick={() => setMobileOpen(false)}
                className="rounded-md p-1.5 text-muted hover:bg-surface hover:text-ink"
                aria-label="Close menu"
              >
                <X size={20} strokeWidth={1.75} />
              </button>
            </div>
            <SidebarContent email={email} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}
    </>
  );
}
