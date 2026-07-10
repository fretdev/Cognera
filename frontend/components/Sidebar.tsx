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
import ThemeToggle from "@/components/ThemeToggle";

const NAV = [
  { href: "/documents",   label: "Documents",            icon: FileText },
  { href: "/study-tools", label: "Flashcards & Quizzes", icon: Layers },
  { href: "/planner",     label: "Planner",               icon: CalendarClock },
];

function groupConversations(list: Conversation[]) {
  const now = Date.now();
  const today = new Date(); today.setHours(0,0,0,0);
  const yesterday = today.getTime() - 86_400_000;
  const week = today.getTime() - 6 * 86_400_000;
  const g: Record<string, Conversation[]> = { Today: [], Yesterday: [], "Previous 7 days": [], Older: [] };
  for (const c of list) {
    const t = new Date(c.updated_at).getTime();
    if (t >= today.getTime()) g.Today.push(c);
    else if (t >= yesterday) g.Yesterday.push(c);
    else if (t >= week) g["Previous 7 days"].push(c);
    else g.Older.push(c);
  }
  return g;
}

function SidebarInner({ email, collapsed, onNavigate }: {
  email?: string | null; collapsed?: boolean; onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
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

  const navLinkStyle = (active: boolean) => ({
    display: "flex", alignItems: "center", gap: "10px",
    borderRadius: "8px", padding: "7px 10px",
    fontSize: "13.5px", fontWeight: active ? "500" : "400",
    color: active ? "var(--t1)" : "var(--t2)",
    background: active ? "var(--s3)" : "transparent",
    textDecoration: "none", transition: "all 0.12s",
    whiteSpace: "nowrap" as const, overflow: "hidden",
  });

  const groups = groupConversations(conversations);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* New chat */}
      <div className="px-2 mb-1">
        <Link href="/chat" onClick={onNavigate}
          style={navLinkStyle(pathname === "/chat")}
          onMouseEnter={e => { if (pathname !== "/chat") { (e.currentTarget as HTMLElement).style.background = "var(--s2)"; (e.currentTarget as HTMLElement).style.color = "var(--t1)"; } }}
          onMouseLeave={e => { if (pathname !== "/chat") { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "var(--t2)"; } }}>
          <MessageSquare size={15} strokeWidth={1.75} style={{ flexShrink: 0 }} />
          {!collapsed && <><span className="flex-1">New chat</span><Plus size={13} strokeWidth={2} style={{ opacity: 0.4 }} /></>}
        </Link>
      </div>

      {/* Nav */}
      <nav className="px-2 space-y-0.5 mb-3">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link key={href} href={href} onClick={onNavigate}
              style={navLinkStyle(active)}
              title={collapsed ? label : undefined}
              onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = "var(--s2)"; (e.currentTarget as HTMLElement).style.color = "var(--t1)"; } }}
              onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "var(--t2)"; } }}>
              <Icon size={15} strokeWidth={1.75} style={{ flexShrink: 0 }} />
              {!collapsed && <span>{label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Conversation history */}
      {!collapsed && (
        <div className="flex-1 overflow-y-auto px-2 min-h-0" style={{ borderTop: "1px solid var(--b1)", paddingTop: "12px" }}>
          {convoError && (
            <p className="px-3 py-2 rounded-lg text-xs" style={{ background: "var(--s2)", color: "var(--t3)" }}>
              Run <code style={{ color: "var(--accent)", fontFamily: "monospace" }}>conversations.sql</code> in Supabase to enable history.
            </p>
          )}
          {!convoError && conversations.length === 0 && (
            <p className="px-2 text-xs" style={{ color: "var(--t3)" }}>No conversations yet</p>
          )}
          {!convoError && Object.entries(groups).map(([label, items]) => {
            if (!items.length) return null;
            return (
              <div key={label} className="mb-4">
                <p className="px-2 mb-1.5 font-medium"
                  style={{ fontSize: "10.5px", letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--t3)" }}>
                  {label}
                </p>
                {items.map(c => {
                  const active = pathname === `/c/${c.id}`;
                  const confirming = deletingId === c.id;
                  return (
                    <Link key={c.id} href={`/c/${c.id}`} onClick={onNavigate}
                      className="group relative flex items-center rounded-lg px-2 py-1.5 transition-colors"
                      style={{ background: active ? "var(--s3)" : "transparent", color: active ? "var(--t1)" : "var(--t2)", fontSize: "13px" }}
                      onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = "var(--s2)"; (e.currentTarget as HTMLElement).style.color = "var(--t1)"; } }}
                      onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = active ? "var(--s3)" : "transparent"; (e.currentTarget as HTMLElement).style.color = active ? "var(--t1)" : "var(--t2)"; } }}>
                      <span className="flex-1 truncate" style={{ paddingRight: "20px" }}>{c.title}</span>
                      <button type="button" onClick={e => handleDeleteConvo(e, c.id)}
                        aria-label="Delete"
                        className="absolute right-1.5 rounded p-0.5 opacity-0 transition-all group-hover:opacity-100"
                        style={{ color: confirming ? "var(--red)" : "var(--t3)" }}>
                        <Trash2 size={12} />
                      </button>
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {collapsed && <div className="flex-1" />}

      {/* Footer — theme + signout */}
      <div className="px-2 py-2" style={{ borderTop: "1px solid var(--b1)" }}>
        {!collapsed && (
          <p className="truncate px-3 mb-1 text-xs" style={{ color: "var(--t3)" }}>{email}</p>
        )}
        <ThemeToggle collapsed={collapsed} />
        <button onClick={async () => { await createClient().auth.signOut(); router.push("/login"); router.refresh(); }}
          title={collapsed ? "Sign out" : undefined}
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm w-full transition-colors mt-0.5"
          style={{ color: "var(--t2)" }}
          onMouseEnter={e => { e.currentTarget.style.background = "var(--s2)"; e.currentTarget.style.color = "var(--t1)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--t2)"; }}>
          <LogOut size={15} strokeWidth={1.75} style={{ flexShrink: 0 }} />
          {!collapsed && <span>Sign out</span>}
        </button>
      </div>
    </div>
  );
}

export default function Sidebar({ email }: { email?: string | null }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const router = useRouter();

  const sidebarBase: React.CSSProperties = {
    background: "var(--s1)",
    borderRight: "1px solid var(--b1)",
    backgroundImage: "none",
  };

  return (
    <>
      <aside className={`hidden md:flex flex-col h-screen flex-shrink-0 transition-all duration-200 ${collapsed ? "w-[58px]" : "w-58"}`}
        style={{ ...sidebarBase, width: collapsed ? "58px" : "228px" }}>
        <div className="flex items-center justify-between px-4 py-5">
          <Link href="/chat" aria-label="Go to chat">
            {collapsed ? <CogneraMark size={22} /> : <CogneraWordmark size={22} />}
          </Link>
          <button onClick={() => setCollapsed(c => !c)}
            className="rounded-lg p-1.5 transition-colors"
            style={{ color: "var(--t3)" }}
            onMouseEnter={e => { e.currentTarget.style.background = "var(--s2)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
            {collapsed ? <PanelLeftOpen size={14} strokeWidth={1.75} /> : <PanelLeftClose size={14} strokeWidth={1.75} />}
          </button>
        </div>
        <SidebarInner email={email} collapsed={collapsed} />
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden flex items-center justify-between px-4 py-3"
        style={{ ...sidebarBase, borderRight: "none", borderBottom: "1px solid var(--b1)" }}>
        <Link href="/chat" aria-label="Go to chat"><CogneraWordmark size={20} /></Link>
        <button onClick={() => setMobileOpen(true)} style={{ color: "var(--t2)" }} aria-label="Open menu">
          <Menu size={18} strokeWidth={1.75} />
        </button>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 flex flex-col h-full w-64" style={sidebarBase}>
            <div className="flex items-center justify-between px-4 py-5">
              <Link href="/chat" onClick={() => setMobileOpen(false)} aria-label="Go to chat">
                <CogneraWordmark size={22} />
              </Link>
              <button onClick={() => setMobileOpen(false)} style={{ color: "var(--t3)" }} aria-label="Close">
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
