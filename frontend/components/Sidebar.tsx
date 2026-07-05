"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  FileText, Layers, CalendarClock, LogOut,
  PanelLeftClose, PanelLeftOpen, Menu, X, Plus, Trash2, MessageSquare
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { CogneraMark, CogneraWordmark } from "@/components/brand/CogneraLogo";
import { listConversations, deleteConversation, type Conversation } from "@/lib/conversations";

const NAV = [
  { href: "/documents",   label: "Documents",           icon: FileText },
  { href: "/study-tools", label: "Flashcards & Quizzes", icon: Layers },
  { href: "/planner",     label: "Planner",              icon: CalendarClock },
];

function groupConversations(list: Conversation[]) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterday = today - 86_400_000;
  const week = today - 6 * 86_400_000;
  const g: Record<string, Conversation[]> = { Today: [], Yesterday: [], "Previous 7 days": [], Older: [] };
  for (const c of list) {
    const t = new Date(c.updated_at).getTime();
    if (t >= today) g.Today.push(c);
    else if (t >= yesterday) g.Yesterday.push(c);
    else if (t >= week) g["Previous 7 days"].push(c);
    else g.Older.push(c);
  }
  return g;
}

function NavItem({ href, label, icon: Icon, active, collapsed, onClick }: {
  href: string; label: string; icon: React.ElementType;
  active: boolean; collapsed?: boolean; onClick?: () => void;
}) {
  return (
    <Link href={href} onClick={onClick} title={collapsed ? label : undefined}
      className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors group"
      style={{
        background: active ? "var(--surface-2)" : "transparent",
        color: active ? "var(--text-1)" : "var(--text-3)",
      }}
      onMouseEnter={e => { if (!active) { e.currentTarget.style.background = "var(--surface-1)"; e.currentTarget.style.color = "var(--text-2)"; } }}
      onMouseLeave={e => { if (!active) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-3)"; } }}
    >
      <Icon size={15} strokeWidth={1.75} className="flex-shrink-0" />
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  );
}

function SidebarInner({ email, collapsed, onNavigate }: { email?: string | null; collapsed?: boolean; onNavigate?: () => void; }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [convoError, setConvoError] = useState(false);

  useEffect(() => {
    listConversations()
      .then(d => { setConversations(d); setConvoError(false); })
      .catch(() => setConvoError(true));
  }, [pathname]);

  async function handleDeleteConvo(e: React.MouseEvent, id: string) {
    e.preventDefault(); e.stopPropagation();
    if (deletingId === id) {
      await deleteConversation(id);
      setConversations(p => p.filter(c => c.id !== id));
      if (pathname === `/c/${id}`) router.push("/chat");
      setDeletingId(null);
    } else {
      setDeletingId(id);
      setTimeout(() => setDeletingId(cur => cur === id ? null : cur), 3000);
    }
  }

  const groups = groupConversations(conversations);

  return (
    <div className="flex flex-col h-full">
      {/* New chat */}
      <div className="px-2 pb-1">
        <Link href="/chat" onClick={onNavigate} title={collapsed ? "New chat" : undefined}
          className="group flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors w-full"
          style={{ color: "var(--text-3)" }}
          onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-1)"; e.currentTarget.style.color = "var(--text-2)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-3)"; }}>
          <MessageSquare size={15} strokeWidth={1.75} className="flex-shrink-0" />
          {!collapsed && (
            <>
              <span>New chat</span>
              <Plus size={13} strokeWidth={2} className="ml-auto opacity-0 transition-opacity group-hover:opacity-100" />
            </>
          )}
        </Link>
      </div>

      {/* Nav */}
      <nav className="px-2 space-y-0.5">
        {NAV.map(item => (
          <NavItem key={item.href} {...item}
            active={pathname === item.href}
            collapsed={collapsed}
            onClick={onNavigate}
          />
        ))}
      </nav>

      {/* Conversation history */}
      {!collapsed && (
        <div className="mt-4 flex-1 overflow-y-auto px-2 min-h-0">
          <div style={{ borderTop: "1px solid var(--border-1)", paddingTop: "16px" }}>
            {convoError && (
              <div className="px-3 py-2 rounded-lg text-xs" style={{ background: "var(--surface-1)", color: "var(--text-3)" }}>
                Run <code style={{ color: "var(--accent)", fontFamily: "monospace" }}>conversations.sql</code> in Supabase to enable history.
              </div>
            )}
            {!convoError && conversations.length === 0 && (
              <p className="px-3 text-xs" style={{ color: "var(--text-3)" }}>No conversations yet</p>
            )}
            {!convoError && Object.entries(groups).map(([label, items]) => {
              if (!items.length) return null;
              return (
                <div key={label} className="mb-5">
                  <p className="px-3 mb-1 text-xs uppercase tracking-wider" style={{ color: "var(--text-3)", fontSize: "10.5px", letterSpacing: "0.06em" }}>
                    {label}
                  </p>
                  {items.map(c => {
                    const active = pathname === `/c/${c.id}`;
                    const confirming = deletingId === c.id;
                    return (
                      <Link key={c.id} href={`/c/${c.id}`} onClick={onNavigate}
                        className="group relative flex items-center rounded-lg px-3 py-1.5 text-sm transition-colors"
                        style={{ background: active ? "var(--surface-2)" : "transparent", color: active ? "var(--text-1)" : "var(--text-3)" }}
                        onMouseEnter={e => { if (!active) { e.currentTarget.style.background = "var(--surface-1)"; e.currentTarget.style.color = "var(--text-2)"; } }}
                        onMouseLeave={e => { if (!active) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-3)"; } }}>
                        <span className="flex-1 truncate pr-5" style={{ fontSize: "13px" }}>{c.title}</span>
                        <button type="button" onClick={e => handleDeleteConvo(e, c.id)}
                          aria-label="Delete conversation"
                          className="absolute right-2 rounded p-0.5 opacity-0 transition-all group-hover:opacity-100"
                          style={{ color: confirming ? "var(--red)" : "var(--text-3)" }}>
                          <Trash2 size={12} strokeWidth={1.75} />
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

      {/* Footer */}
      <div className="px-2 py-3" style={{ borderTop: "1px solid var(--border-1)" }}>
        {!collapsed && (
          <p className="truncate px-3 pb-2 text-xs" style={{ color: "var(--text-3)" }}>{email}</p>
        )}
        <button onClick={async () => { await createClient().auth.signOut(); router.push("/login"); router.refresh(); }}
          title={collapsed ? "Sign out" : undefined}
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm w-full transition-colors"
          style={{ color: "var(--text-3)" }}
          onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-1)"; e.currentTarget.style.color = "var(--text-2)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-3)"; }}>
          <LogOut size={15} strokeWidth={1.75} className="flex-shrink-0" />
          {!collapsed && <span>Sign out</span>}
        </button>
      </div>
    </div>
  );
}

export default function Sidebar({ email }: { email?: string | null }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const sidebarStyle = {
    background: "var(--surface-1)",
    borderRight: "1px solid var(--border-1)",
    backgroundImage: "none",
  };

  return (
    <>
      {/* Desktop */}
      <aside className={`hidden md:flex flex-col h-screen flex-shrink-0 transition-all duration-200 ${collapsed ? "w-16" : "w-60"}`}
        style={sidebarStyle}>
        <div className="flex items-center justify-between px-4 py-5">
          {collapsed ? <CogneraMark size={22} /> : <CogneraWordmark size={22} />}
          <button onClick={() => setCollapsed(c => !c)}
            className="rounded-lg p-1.5 transition-colors"
            style={{ color: "var(--text-3)" }}
            onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-2)"; e.currentTarget.style.color = "var(--text-2)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-3)"; }}
            aria-label={collapsed ? "Expand" : "Collapse"}>
            {collapsed ? <PanelLeftOpen size={15} strokeWidth={1.75} /> : <PanelLeftClose size={15} strokeWidth={1.75} />}
          </button>
        </div>
        <SidebarInner email={email} collapsed={collapsed} />
      </aside>

      {/* Mobile bar */}
      <div className="md:hidden flex items-center justify-between px-4 py-3" style={{ ...sidebarStyle, borderRight: "none", borderBottom: "1px solid var(--border-1)" }}>
        <CogneraWordmark size={20} />
        <button onClick={() => setMobileOpen(true)} style={{ color: "var(--text-3)" }} aria-label="Open menu">
          <Menu size={18} strokeWidth={1.75} />
        </button>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-72 flex flex-col" style={sidebarStyle}>
            <div className="flex items-center justify-between px-4 py-5">
              <CogneraWordmark size={22} />
              <button onClick={() => setMobileOpen(false)} style={{ color: "var(--text-3)" }} aria-label="Close">
                <X size={18} strokeWidth={1.75} />
              </button>
            </div>
            <SidebarInner email={email} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}
    </>
  );
}
