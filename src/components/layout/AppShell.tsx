import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutGrid,
  Globe2,
  Radar,
  Filter,
  History,
  Satellite,
  Bell,
  Activity,
} from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/",            label: "Command Centre",  icon: LayoutGrid, code: "CC" },
  { to: "/macro",       label: "Macro",           icon: Globe2,     code: "MA" },
  { to: "/radar",       label: "Opportunity Radar", icon: Radar,    code: "OR" },
  { to: "/screeners",   label: "Screeners",       icon: Filter,     code: "SC" },
  { to: "/history",     label: "Historical Events", icon: History,  code: "HE" },
  { to: "/alt-data",    label: "Alternative Data", icon: Satellite, code: "AD" },
  { to: "/alerts",      label: "Alerts",          icon: Bell,       code: "AL" },
  { to: "/data-health", label: "Data Health",     icon: Activity,   code: "DH" },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (r) => r.location.pathname });

  return (
    <div className="flex min-h-screen w-full bg-background text-foreground">
      <aside className="hidden md:flex w-56 shrink-0 flex-col border-r border-border/70 bg-sidebar">
        <div className="flex h-12 items-center gap-2 border-b border-border/70 px-3">
          <div className="h-2 w-2 rounded-full bg-[oklch(var(--primary))] shadow-[0_0_8px_oklch(var(--primary))]" />
          <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            Research Terminal
          </div>
        </div>
        <nav className="flex-1 p-2">
          {NAV.map((item) => {
            const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "group flex items-center gap-2 rounded-sm px-2 py-1.5 text-[12px] transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground",
                )}
              >
                <span className={cn(
                  "font-mono text-[9px] tracking-wider",
                  active ? "text-[oklch(var(--primary))]" : "text-muted-foreground/60",
                )}>
                  {item.code}
                </span>
                <Icon className="h-3.5 w-3.5" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-border/70 p-2 font-mono text-[10px] text-muted-foreground">
          <div>Phase 1 · Foundation</div>
          <div className="text-[oklch(var(--warning))]">No live data wired</div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 items-center justify-between border-b border-border/70 px-4">
          <div className="flex items-center gap-3">
            <div className="md:hidden font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              Research Terminal
            </div>
            <div className="hidden md:flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-[oklch(var(--positive))]" />
              <span>system online</span>
              <span>·</span>
              <span>calc v0.1</span>
            </div>
          </div>
          <div className="font-mono text-[10px] text-muted-foreground">
            <ClientClock />
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
              active ? "border-b border-[oklch(var(--primary))] text-foreground" : "text-muted-foreground",
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