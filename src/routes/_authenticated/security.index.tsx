import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { getSecurityUniverse } from "@/lib/panels/security.functions";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const COLUMN_HELP: Record<string, { title: string; source: string; good: string; bad: string }> = {
  Symbol: { title: "Ticker symbol", source: "Assets master (curated universe).", good: "—", bad: "—" },
  Name: { title: "Company name", source: "Assets master.", good: "—", bad: "—" },
  Industry: { title: "GICS-style industry classification", source: "Assets master → industries table.", good: "—", bad: "—" },
  Mo: {
    title: "Momentum score (0–100)",
    source: "Deterministic scorer over daily closes from the equity price pool (Stooq / Tiingo / Twelve Data / FMP). See src/lib/scoring/momentum.server.ts.",
    good: "≥ 60 — strong trailing returns across 1M / 3M / 6M windows.",
    bad: "≤ 40 — weak or negative trailing returns; losing relative strength.",
  },
  Tr: {
    title: "Trend score (0–100)",
    source: "Deterministic scorer using moving-average structure and slope on daily closes. See src/lib/scoring/trend.server.ts.",
    good: "≥ 60 — price above rising long-term MAs; clean uptrend.",
    bad: "≤ 40 — price below falling MAs; broken or choppy structure.",
  },
  Vol: {
    title: "Volatility score (0–100, inverted)",
    source: "Realised daily-return volatility from the price pool. See src/lib/scoring/volatility.server.ts.",
    good: "≥ 60 — calmer than peers; lower realised vol.",
    bad: "≤ 40 — noisier than peers; elevated realised vol.",
  },
  Val: {
    title: "Valuation score (0–100)",
    source: "Industry-relative percentiles of TTM P/E, EV/EBITDA, P/S, P/B and FCF yield from FMP fundamentals. See src/lib/scoring/valuation.server.ts.",
    good: "≥ 60 — cheap vs. industry peers on multiple ratios.",
    bad: "≤ 40 — expensive vs. industry peers.",
  },
  Qual: {
    title: "Quality score (0–100)",
    source: "Industry-relative percentiles of ROE, ROIC, gross/net margin, debt/equity, current ratio from FMP fundamentals.",
    good: "≥ 60 — high returns on capital, healthy margins, sensible leverage.",
    bad: "≤ 40 — thin margins, weak returns, or stretched balance sheet.",
  },
  Comp: {
    title: "Composite score",
    source: "Weighted blend: 60% technicals (momentum, trend, volatility) + 40% fundamentals (valuation, quality). See src/lib/scoring/composite.ts.",
    good: "Higher = stronger all-round setup; drives Radar ranking.",
    bad: "Lower = weak setup; drives Overvaluation Radar candidacy.",
  },
  Last: {
    title: "Last close price",
    source: "Most recent daily bar from prices_daily (equity price pool).",
    good: "—",
    bad: "—",
  },
};

function HeaderCell({ label, align = "left" }: { label: string; align?: "left" | "right" }) {
  const help = COLUMN_HELP[label];
  const cls = align === "right" ? "text-right" : "";
  if (!help) return <div className={cls}>{label}</div>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={cn(cls, "cursor-help underline decoration-dotted decoration-border underline-offset-4")}>{label}</div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs space-y-1.5 text-[11px] leading-relaxed">
        <div className="font-semibold text-foreground">{help.title}</div>
        <div><span className="text-muted-foreground">Source: </span>{help.source}</div>
        {help.good !== "—" && <div><span className="text-[var(--positive)]">Good: </span>{help.good}</div>}
        {help.bad !== "—" && <div><span className="text-[var(--negative)]">Bad: </span>{help.bad}</div>}
      </TooltipContent>
    </Tooltip>
  );
}

const universeQuery = queryOptions({
  queryKey: ["security", "universe"],
  queryFn: () => getSecurityUniverse(),
});

export const Route = createFileRoute("/_authenticated/security/")({
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
      <TooltipProvider delayDuration={150}>
      <div className="rounded-md border border-border/70 bg-card/40">
        <div className="grid grid-cols-[80px_minmax(0,1fr)_110px_50px_50px_50px_50px_50px_70px_90px] items-center border-b border-border/70 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          <HeaderCell label="Symbol" />
          <HeaderCell label="Name" />
          <HeaderCell label="Industry" />
          <HeaderCell label="Mo" align="right" />
          <HeaderCell label="Tr" align="right" />
          <HeaderCell label="Vol" align="right" />
          <HeaderCell label="Val" align="right" />
          <HeaderCell label="Qual" align="right" />
          <HeaderCell label="Comp" align="right" />
          <HeaderCell label="Last" align="right" />
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
      </TooltipProvider>
      <div className="mt-3 font-mono text-[10px] text-muted-foreground">
        {rows.length} securities · sorted by composite (momentum, trend, volatility, valuation, quality)
      </div>
    </AppShell>
  );
}