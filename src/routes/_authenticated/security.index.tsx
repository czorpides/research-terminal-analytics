import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { getSecurityUniverse } from "@/lib/panels/security.functions";
import { cn } from "@/lib/utils";

const universeQuery = queryOptions({
  queryKey: ["security", "universe"],
  queryFn: () => getSecurityUniverse(),
});

export const Route = createFileRoute("/_authenticated/security/index")({
  head: () => ({ meta: [
    { title: "Security Master — Research Terminal" },
    { name: "description", content: "Full equity universe with latest scores. Drill into any name for the auditable research deep dive." },
  ]}),
  loader: ({ context }) => context.queryClient.ensureQueryData(universeQuery),
  errorComponent: ({ error }) => <AppShell><div className="p-4 text-sm text-[var(--negative)]">Failed to load universe: {String(error)}</div></AppShell>,
  notFoundComponent: () => <AppShell><div className="p-4 text-sm">Not found.</div></AppShell>,
  component: SecurityIndex,
});

function tone(v: number | null) {
  if (v === null) return "text-muted-foreground";
  if (v >= 60) return "text-[var(--positive)]";
  if (v <= 40) return "text-[var(--negative)]";
  return "text-foreground";
}

function SecurityIndex() {
  const { data: rows } = useSuspenseQuery(universeQuery);
  return (
    <AppShell>
      <SectionHeader
        code="SM · Security Master"
        title="The equity universe, one row per instrument."
        purpose="Reference identity plus latest deterministic scores. Click any row for the auditable deep dive."
      />
      <div className="rounded-md border border-border/70 bg-card/40">
        <div className="grid grid-cols-[80px_minmax(0,1fr)_110px_50px_50px_50px_50px_50px_70px_90px] items-center border-b border-border/70 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          <div>Symbol</div>
          <div>Name</div>
          <div>Industry</div>
          <div className="text-right">Mo</div>
          <div className="text-right">Tr</div>
          <div className="text-right">Vol</div>
          <div className="text-right">Val</div>
          <div className="text-right">Qual</div>
          <div className="text-right">Comp</div>
          <div className="text-right">Last</div>
        </div>
        {rows.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground">
            No assets in the universe yet.
          </div>
        ) : rows.map((r) => (
          <Link
            key={r.symbol}
            to="/security/$symbol"
            params={{ symbol: r.symbol }}
            className="grid grid-cols-[80px_minmax(0,1fr)_110px_50px_50px_50px_50px_50px_70px_90px] items-center border-b border-border/60 px-3 py-1.5 text-[12px] transition-colors hover:bg-muted/40 last:border-b-0"
          >
            <div className="font-mono font-semibold text-foreground">{r.symbol}</div>
            <div className="truncate text-foreground">{r.name}</div>
            <div className="truncate text-[11px] text-muted-foreground">{r.industry ?? "—"}</div>
            <div className={cn("text-right font-mono tabular-nums", tone(r.momentum))}>{r.momentum?.toFixed(0) ?? "—"}</div>
            <div className={cn("text-right font-mono tabular-nums", tone(r.trend))}>{r.trend?.toFixed(0) ?? "—"}</div>
            <div className={cn("text-right font-mono tabular-nums", tone(r.volatility))}>{r.volatility?.toFixed(0) ?? "—"}</div>
            <div className={cn("text-right font-mono tabular-nums", tone(r.valuation))}>{r.valuation?.toFixed(0) ?? "—"}</div>
            <div className={cn("text-right font-mono tabular-nums", tone(r.quality))}>{r.quality?.toFixed(0) ?? "—"}</div>
            <div className={cn("text-right font-mono tabular-nums font-semibold", tone(r.composite))}>{r.composite?.toFixed(1) ?? "—"}</div>
            <div className="text-right font-mono tabular-nums text-muted-foreground">{r.lastClose?.toFixed(2) ?? "—"}</div>
          </Link>
        ))}
      </div>
      <div className="mt-3 font-mono text-[10px] text-muted-foreground">
        {rows.length} securities · sorted by composite (momentum, trend, volatility, valuation, quality)
      </div>
    </AppShell>
  );
}