/**
 * Shared page for every route in the nav config that isn't 'active' yet.
 * Reads the route entry from the central navigation registry and renders a
 * consistent "what this will become" page — purpose, required data, required
 * models, current stage, and a link back to the group's overview.
 */
import { Link } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { NAV_GROUPS, STATUS_META, findRouteByPath, type RouteEntry } from "@/lib/navigation/routes";
import { cn } from "@/lib/utils";

function statusClasses(tone: string) {
  switch (tone) {
    case "positive": return "text-[var(--positive)] border-[var(--positive)]/40 bg-[var(--positive)]/10";
    case "info":     return "text-[var(--primary)] border-[var(--primary)]/40 bg-[var(--primary)]/10";
    case "warning":  return "text-yellow-400 border-yellow-500/40 bg-yellow-500/10";
    case "danger":   return "text-[var(--negative)] border-[var(--negative)]/40 bg-[var(--negative)]/10";
    default:         return "text-muted-foreground border-border/70 bg-muted/30";
  }
}

export function PlannedFeaturePage({ pathname }: { pathname: string }) {
  const route = findRouteByPath(pathname);
  return (
    <AppShell>
      {route ? <Body route={route} /> : <Unknown pathname={pathname} />}
    </AppShell>
  );
}

function Body({ route }: { route: RouteEntry }) {
  const group = NAV_GROUPS.find((g) => g.key === route.group)!;
  const status = STATUS_META[route.status];
  const Icon = route.icon;
  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow={`${group.label} · Stage ${route.stage}`}
        title={route.name}
        description={route.purpose}
      />

      <div className="flex flex-wrap items-center gap-2 font-mono text-[10px]">
        <span className={cn("inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 uppercase tracking-wider", statusClasses(status.tone))}>
          <Icon className="h-3 w-3" />
          {status.label}
        </span>
        <span className="rounded-sm border border-border/70 px-2 py-0.5 text-muted-foreground">
          {route.path}
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <MetaCard title="Required data" items={route.requiredDataSources} emptyLabel="No external data" />
        <MetaCard title="Required models" items={route.requiredModels} emptyLabel="No models" />
      </div>

      <div className="rounded-sm border border-border/70 bg-card/40 p-4 text-xs text-muted-foreground">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/80">Why this route exists now</p>
        <p className="leading-relaxed">
          The information architecture is registered up front so every planned surface has a stable URL from day one.
          When the required data and models land, this route flips to <span className="text-foreground">active</span> and
          the real page replaces this placeholder without any URL change. Bookmarks made today will keep working.
        </p>
        <div className="mt-4 flex gap-2">
          <Link to={groupOverviewPath(route.group)} className="inline-flex items-center rounded-sm border border-border/70 px-2 py-1 font-mono text-[10px] uppercase tracking-wider hover:border-[var(--primary)] hover:text-foreground">
            ← {group.label} overview
          </Link>
          <Link to="/data-health" className="inline-flex items-center rounded-sm border border-border/70 px-2 py-1 font-mono text-[10px] uppercase tracking-wider hover:border-[var(--primary)] hover:text-foreground">
            Data health
          </Link>
        </div>
      </div>
    </div>
  );
}

function MetaCard({ title, items, emptyLabel }: { title: string; items: string[]; emptyLabel: string }) {
  return (
    <div className="rounded-sm border border-border/70 bg-card/40 p-4">
      <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/80">{title}</p>
      {items.length === 0 ? (
        <p className="font-mono text-[11px] text-muted-foreground">{emptyLabel}</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {items.map((it) => (
            <li key={it} className="rounded-sm border border-border/70 bg-background/60 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-foreground">
              {it}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Unknown({ pathname }: { pathname: string }) {
  return (
    <div className="space-y-4">
      <SectionHeader eyebrow="Not registered" title="Unknown route" description={`No entry in the navigation registry matches ${pathname}.`} />
      <Link to="/" className="inline-flex items-center rounded-sm border border-border/70 px-2 py-1 font-mono text-[10px] uppercase tracking-wider hover:border-[var(--primary)] hover:text-foreground">
        ← Command Centre
      </Link>
    </div>
  );
}

function groupOverviewPath(g: RouteEntry["group"]): "/" | "/macro" | "/history" | "/alt-data" {
  if (g === "macro")   return "/macro";
  if (g === "history") return "/history";
  if (g === "altdata") return "/alt-data";
  return "/";
}