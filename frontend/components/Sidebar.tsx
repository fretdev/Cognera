"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  MessageSquare, FileText, Layers, CalendarClock,
  LogOut, PanelLeftClose, PanelLeftOpen,
  Menu, X, Plus, Trash2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { CogneraMark, CogneraWordmark } from "@/components/brand/CogneraLogo";
import { listConversations, deleteConversation, type Conversation } from "@/lib/conversations";

const NAV_ITEMS = [
  { href: "/documents", label: "Documents", icon: FileText },
  { href: "/study-tools", label: "Flashcards & Quizzes", icon: Layers },
  { href: "/planner", label: "Planner", icon: CalendarClock },
];

function groupConversations(conversations: Conversation[]) {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart.getTime() - 86_400_000);
  const weekStart = new Date(todayStart.getTime() - 6 * 86_400_000);
  const groups: Record<string, Conversation[]> = {
    Today: [], Yesterday: [], "Previous 7 days": [], Older: [],
  };
  for (const c of conversations) {
    const d = new Date(c.updated_at);
    if (d >= todayStart) groups["Today"].push(c);
    else if (d >= yesterdayStart) groups["Yesterday"].push(c);
    else if (d >= weekStart) groups["Previous 7 days"].push(c);
    else groups["Older"].push(c);
  }
  return groups;
}

function Logo({ collapsed }: { collapsed?: boolean }) {
  return collapsed ? <CogneraMark size={28} /> : <CogneraWordmark iconSize={28} />;
}

function SidebarContent({
  email, collapsed, onNavigate,
}: {
  email?: string | null;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [convoError, setConvoError] = useState(false);

  useEffect(() => {
    listConversations()
      .then((data) => { setConversations(data); setConvoError(false); })
      .catch(() => setConvoError(true));
  }, [pathname]);

  async function handleDeleteConvo(e: React.MouseEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    if (deletingId === id) {
      await deleteConversation(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (pathname === `/c/${id}`) router.push("/");
      setDeletingId(null);
    } else {
      setDeletingId(id);
      setTimeout(() => setDeletingId((cur) => (cur === id ? null : cur)), 3000);
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const groups = groupConversations(conversations);

  return (
    <>
      {/* New chat */}
      <div className="px-3 pb-1">
        <Link
          href="/chat"
          onClick={onNavigate}
          className="group flex items-center gap-3 rounded-full px-3 py-2.5 text-sm text-muted transition-colors hover:bg-surface hover:text-ink"
          title={collapsed ? "New chat" : undefined}
        >
          <MessageSquare size={18} strokeWidth={1.75} className="flex-shrink-0" />
          {!collapsed && (
            <>
              <span>New chat</span>
              <Plus size={15} strokeWidth={1.75} className="ml-auto opacity-0 transition-opacity group-hover:opacity-100" />
            </>
          )}
        </Link>
      </div>

      {/* Nav items */}
      <nav className="flex flex-col gap-1 px-3">
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
                active ? "bg-surface font-medium text-ink" : "text-muted hover:bg-surface hover:text-ink"
              }`}
            >
              <Icon size={18} strokeWidth={1.75} className="flex-shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Conversation history */}
      {!collapsed && (
        <div className="mt-4 flex-1 overflow-y-auto px-3">
          <div className="border-t border-border pt-4">
            {convoError && (
              <p className="rounded-lg bg-surface px-3 py-2 text-xs text-muted">
                Run <code className="font-mono text-ink">conversations.sql</code> in Supabase SQL Editor to enable chat history.
              </p>
            )}
            {!convoError && conversations.length === 0 && (
              <p className="px-2 text-xs text-muted">
                No conversations yet — start chatting.
              </p>
            )}
            {!convoError && Object.entries(groups).map(([label, items]) => {
              if (items.length === 0) return null;
              return (
                <div key={label} className="mb-4">
                  <p className="mb-1.5 px-2 text-xs font-medium text-muted">{label}</p>
                  {items.map((c) => {
                    const active = pathname === `/c/${c.id}`;
                    const confirming = deletingId === c.id;
                    return (
                      <Link
                        key={c.id}
                        href={`/c/${c.id}`}
                        onClick={onNavigate}
                        className={`group relative flex items-center rounded-xl px-3 py-2 text-sm transition-colors ${
                          active ? "bg-surface text-ink" : "text-muted hover:bg-surface hover:text-ink"
                        }`}
                      >
                        <span className="flex-1 truncate pr-6">{c.title}</span>
                        <button
                          type="button"
                          onClick={(e) => handleDeleteConvo(e, c.id)}
                          aria-label={confirming ? "Confirm delete" : "Delete conversation"}
                          className={`absolute right-2 flex-shrink-0 rounded p-0.5 opacity-0 transition-all group-hover:opacity-100 ${
                            confirming ? "text-[#f28b82] opacity-100" : "text-muted hover:text-ink"
                          }`}
                        >
                          <Trash2 size={13} strokeWidth={1.75} />
                        </button>
                      </Link>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {collapsed && <div className="flex-1" />}

      {/* User + sign out */}
      <div className="border-t border-border px-3 py-3">
        {!collapsed && (
          <p className="truncate px-2 pb-2 text-xs text-muted">{email}</p>
        )}
        <button
          onClick={handleSignOut}
          title={collapsed ? "Sign out" : undefined}
          className="group flex w-full items-center gap-3 rounded-full px-3 py-2.5 text-sm text-muted transition-colors hover:bg-surface hover:text-ink"
        >
          <LogOut size={18} strokeWidth={1.75} className="flex-shrink-0" />
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
            {collapsed ? <PanelLeftOpen size={18} strokeWidth={1.75} /> : <PanelLeftClose size={18} strokeWidth={1.75} />}
          </button>
        </div>
        <SidebarContent email={email} collapsed={collapsed} />
      </aside>

      {/* Mobile top bar */}
      <div className="flex items-center justify-between border-b border-border bg-bg px-4 py-3 md:hidden">
        <Logo />
        <button onClick={() => setMobileOpen(true)} className="rounded-md p-1.5 text-muted hover:bg-surface hover:text-ink" aria-label="Open menu">
          <Menu size={20} strokeWidth={1.75} />
        </button>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 flex h-full w-72 flex-col border-r border-border bg-bg">
            <div className="flex items-center justify-between px-4 py-5">
              <Logo />
              <button onClick={() => setMobileOpen(false)} className="rounded-md p-1.5 text-muted hover:bg-surface hover:text-ink" aria-label="Close menu">
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
