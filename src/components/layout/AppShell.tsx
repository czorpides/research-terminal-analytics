import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  LayoutGrid,
  Globe2,
  Radar,
  TrendingDown,
  TrendingUp,
  Filter,
  Building2,
  History,
  Satellite,
  Bell,
  Activity,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const NAV = [
  { to: "/",            label: "Command Centre",  icon: LayoutGrid, code: "CC" },
  { to: "/macro",       label: "Macro",           icon: Globe2,     code: "MA" },
  { to: "/radar",       label: "Opportunity Radar", icon: Radar,    code: "OR" },
  { to: "/undervaluation", label: "Undervaluation Radar", icon: TrendingUp, code: "UV" },
  { to: "/overvaluation", label: "Overvaluation Radar", icon: TrendingDown, code: "OV" },
  { to: "/screeners",   label: "Screeners",       icon: Filter,     code: "SC" },
  { to: "/security",    label: "Security Master", icon: Building2,  code: "SM" },
  { to: "/history",     label: "Historical Events", icon: History,  code: "HE" },
  { to: "/alt-data",    label: "Alternative Data", icon: Satellite, code: "AD" },
  { to: "/alerts",      label: "Alerts",          icon: Bell,       code: "AL" },
  { to: "/data-health", label: "Data Health",     icon: Activity,   code: "DH" },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("rt.sidebar.collapsed") === "1";
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("rt.sidebar.collapsed", collapsed ? "1" : "0");
  }, [collapsed]);

  return (
    <div className="flex min-h-screen w-full bg-background text-foreground">
      <aside
        className={cn(
          "hidden md:flex shrink-0 flex-col border-r border-border/70 bg-sidebar sticky top-0 h-screen transition-[width] duration-200",
          collapsed ? "w-12" : "w-56",
        )}
      >
        <div className="flex h-12 items-center gap-2 border-b border-border/70 px-3">
          <div className="h-2 w-2 rounded-full bg-[var(--primary)] shadow-[0_0_8px_var(--primary)]" />
          {!collapsed && (
            <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              Research Terminal
            </div>
          )}
        </div>
        <nav className="flex-1 overflow-y-auto p-2">
          {NAV.map((item) => {
            const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                title={collapsed ? item.label : undefined}
                className={cn(
                  "group flex items-center gap-2 rounded-sm px-2 py-1.5 text-[12px] transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground",
                )}
              >
                {!collapsed && (
                  <span className={cn(
                    "font-mono text-[9px] tracking-wider",
                    active ? "text-[var(--primary)]" : "text-muted-foreground/60",
                  )}>
                    {item.code}
                  </span>
                )}
                <Icon className="h-3.5 w-3.5 shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>
        {!collapsed && (
          <div className="border-t border-border/70 p-2 font-mono text-[10px] text-muted-foreground">
            <div>Phase 3 · Auth + Zones</div>
            <div className="text-[var(--positive)]">Session active</div>
          </div>
        )}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-12 items-center justify-between border-b border-border/70 bg-background/95 backdrop-blur px-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setCollapsed((c) => !c)}
              className="hidden md:inline-flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </button>
            <div className="md:hidden font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              Research Terminal
            </div>
            <div className="hidden md:flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--positive)]" />
              <span>system online</span>
              <span>·</span>
              <span>calc v0.1</span>
            </div>
          </div>
          <div className="flex items-center gap-3 font-mono text-[10px] text-muted-foreground">
            <ClientClock />
            <AccountMenu />
          </div>
        </header>
        <MobileNav pathname={pathname} />
        <main className="min-w-0 flex-1 p-4">{children}</main>
      </div>
    </div>
  );
}

function MobileNav({ pathname }: { pathname: string }) {
  return (
    <nav className="flex md:hidden overflow-x-auto border-b border-border/70 bg-sidebar">
      {NAV.map((item) => {
        const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
        return (
          <Link
            key={item.to}
            to={item.to}
            className={cn(
              "shrink-0 px-3 py-2 font-mono text-[10px] uppercase tracking-wider",
              active ? "border-b border-[var(--primary)] text-foreground" : "text-muted-foreground",
            )}
          >
            {item.code}
          </Link>
        );
      })}
    </nav>
  );
}

function ClientClock() {
  // Render server-safe placeholder; real clock hydrates client-side.
  if (typeof window === "undefined") return <span>—</span>;
  const t = new Date();
  return <span>{t.toLocaleTimeString()} · UTC{-t.getTimezoneOffset() / 60 >= 0 ? "+" : ""}{-t.getTimezoneOffset() / 60}</span>;
}

function AccountMenu() {
  const navigate = useNavigate();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setEmail(s?.user?.email ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function onSignOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  if (!email) return null;
  const initial = email[0]?.toUpperCase() ?? "?";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-6 w-6 items-center justify-center rounded-full border border-border/70 bg-sidebar font-mono text-[10px] text-foreground hover:border-[var(--primary)]"
          aria-label="Account menu"
        >
          {initial}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate text-xs">{email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onSignOut} className="text-xs">Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}