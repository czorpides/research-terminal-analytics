import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { PanelLeftClose, PanelLeftOpen, ChevronRight } from "lucide-react";
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  NAV_GROUPS,
  ROUTES,
  STATUS_META,
  routesInGroup,
  type NavStatus,
  type RouteEntry,
} from "@/lib/navigation/routes";

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
    <TooltipProvider delayDuration={200}>
      <div className="flex min-h-screen w-full bg-background text-foreground">
        <aside
          className={cn(
            "hidden md:flex shrink-0 flex-col border-r border-border/70 bg-sidebar sticky top-0 h-screen transition-[width] duration-200",
            collapsed ? "w-12" : "w-60",
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
          <nav className="flex-1 overflow-y-auto p-1.5">
            {collapsed ? (
              <CollapsedNav pathname={pathname} />
            ) : (
              NAV_GROUPS.map((g) => (
                <NavGroupSection key={g.key} groupKey={g.key} pathname={pathname} />
              ))
            )}
          </nav>
          {!collapsed && (
            <div className="border-t border-border/70 p-2 font-mono text-[10px] text-muted-foreground">
              <div>Stage 1 · Quant upgrade</div>
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
                {collapsed ? (
                  <PanelLeftOpen className="h-4 w-4" />
                ) : (
                  <PanelLeftClose className="h-4 w-4" />
                )}
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
    </TooltipProvider>
  );
}

function isRouteActive(pathname: string, routePath: string): boolean {
  if (routePath === "/") return pathname === "/";
  if (pathname === routePath) return true;
  if (!pathname.startsWith(`${routePath}/`)) return false;

  // Keep a section landing page from appearing active alongside a more
  // specific registered child route. Dynamic deep dives, such as /security/X,
  // still leave their section item active.
  return !ROUTES.some(
    (candidate) =>
      candidate.path !== routePath &&
      candidate.path.startsWith(`${routePath}/`) &&
      (pathname === candidate.path || pathname.startsWith(`${candidate.path}/`)),
  );
}

function MobileNav({ pathname }: { pathname: string }) {
  const activeOnly = ROUTES.filter((r) => r.status === "active");
  return (
    <nav className="flex md:hidden overflow-x-auto border-b border-border/70 bg-sidebar">
      {activeOnly.map((item) => {
        const active = isRouteActive(pathname, item.path);
        return (
          <Link
            key={item.path}
            to={item.path}
            className={cn(
              "shrink-0 px-3 py-2 font-mono text-[10px] uppercase tracking-wider",
              active ? "border-b border-[var(--primary)] text-foreground" : "text-muted-foreground",
            )}
          >
            {item.name}
          </Link>
        );
      })}
    </nav>
  );
}

function CollapsedNav({ pathname }: { pathname: string }) {
  // Icon-only rail. Only real (active) routes are clickable; others show
  // as dimmed icons with a tooltip explaining status.
  return (
    <div className="flex flex-col items-center gap-0.5">
      {ROUTES.map((r) => {
        const active = isRouteActive(pathname, r.path);
        const Icon = r.icon;
        const status = STATUS_META[r.status];
        const isReal = r.status === "active";
        const inner = (
          <div
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-sm",
              active
                ? "bg-sidebar-accent text-[var(--primary)]"
                : isReal
                  ? "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground"
                  : "text-muted-foreground/40",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
          </div>
        );
        return (
          <Tooltip key={r.id}>
            <TooltipTrigger asChild>
              {isReal ? <Link to={r.path}>{inner}</Link> : <div>{inner}</div>}
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">
              <div className="font-medium">{r.name}</div>
              <div className="text-[10px] text-muted-foreground">
                {status.label} · Stage {r.stage}
              </div>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

function NavGroupSection({
  groupKey,
  pathname,
}: {
  groupKey: RouteEntry["group"];
  pathname: string;
}) {
  const group = NAV_GROUPS.find((g) => g.key === groupKey)!;
  const items = routesInGroup(groupKey);
  const containsActive = items.some((r) => isRouteActive(pathname, r.path));
  const [open, setOpen] = useState<boolean>(() => group.defaultOpen || containsActive);
  useEffect(() => {
    if (containsActive) setOpen(true);
  }, [containsActive]);
  const GroupIcon = group.icon;
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mb-1">
      <CollapsibleTrigger className="group flex w-full items-center gap-1.5 rounded-sm px-2 py-1.5 text-muted-foreground hover:bg-sidebar-accent/40 hover:text-foreground">
        <ChevronRight className={cn("h-3 w-3 transition-transform", open && "rotate-90")} />
        <GroupIcon className="h-3.5 w-3.5" />
        <span className="flex-1 text-left font-mono text-[10px] uppercase tracking-[0.15em]">
          {group.label}
        </span>
        <span className="font-mono text-[9px] text-muted-foreground/60">{group.code}</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-0.5 space-y-0.5 pl-3">
          {items.map((r) => (
            <NavItem key={r.id} r={r} pathname={pathname} />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function statusDot(status: NavStatus) {
  switch (status) {
    case "active":
      return "bg-[var(--positive)]";
    case "shadow":
      return "bg-[var(--primary)]";
    case "in_development":
      return "bg-yellow-500";
    case "awaiting_data":
      return "bg-muted-foreground/50";
    case "planned":
      return "bg-muted-foreground/30";
  }
}

function NavItem({ r, pathname }: { r: RouteEntry; pathname: string }) {
  const active = isRouteActive(pathname, r.path);
  const Icon = r.icon;
  const status = STATUS_META[r.status];
  const dim = r.status !== "active";
  const inner = (
    <div
      className={cn(
        "group flex items-center gap-2 rounded-sm px-2 py-1 text-[12px] transition-colors",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : dim
            ? "text-muted-foreground/60 hover:bg-sidebar-accent/40 hover:text-muted-foreground"
            : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground",
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="flex-1 truncate">{r.name}</span>
      <span className={cn("h-1.5 w-1.5 rounded-full", statusDot(r.status))} title={status.label} />
    </div>
  );
  const linked = r.enabled ? (
    <Link to={r.path}>{inner}</Link>
  ) : (
    <div className="cursor-not-allowed">{inner}</div>
  );
  return (
    <Tooltip>
      <TooltipTrigger asChild>{linked}</TooltipTrigger>
      <TooltipContent side="right" className="max-w-[260px] text-xs">
        <div className="font-medium">{r.name}</div>
        <div className="mt-0.5 text-[10px] text-muted-foreground">
          {status.label} · Stage {r.stage}
        </div>
        <div className="mt-1 leading-snug">{r.purpose}</div>
      </TooltipContent>
    </Tooltip>
  );
}

function ClientClock() {
  // Render server-safe placeholder; real clock hydrates client-side.
  if (typeof window === "undefined") return <span>—</span>;
  const t = new Date();
  return (
    <span>
      {t.toLocaleTimeString()} · UTC{-t.getTimezoneOffset() / 60 >= 0 ? "+" : ""}
      {-t.getTimezoneOffset() / 60}
    </span>
  );
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
        <DropdownMenuItem onClick={onSignOut} className="text-xs">
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
