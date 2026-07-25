import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import {
  AlertTriangle,
  ChevronRight,
  CloudSun,
  FlaskConical,
  MessageSquare,
  Satellite,
  Search,
  ShoppingBag,
  Sparkles,
  Truck,
} from "lucide-react";

import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { BandBar } from "@/components/research/ResearchContext";
import { altDataWorkspaceQueryOptions } from "@/components/research/AltDataWorkspace";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/alt-data")({
  head: () => ({
    meta: [
      { title: "Alternative Data — Research Terminal" },
      {
        name: "description",
        content:
          "Alternative evidence hub for attention anomalies, reliability, future search, positioning, sentiment, supply-chain and weather feeds.",
      },
    ],
  }),
  component: AltDataRoute,
});

function AltDataRoute() {
  const pathname = useLocation({ select: (location) => location.pathname });
  const root = pathname === "/alt-data" || pathname === "/alt-data/";
  return root ? <AltDataOverview /> : <Outlet />;
}

function AltDataOverview() {
  const { data } = useSuspenseQuery(altDataWorkspaceQueryOptions);
  const ranked = data.rows.slice(0, 8);
  const averageReliability = data.rows.length
    ? data.rows.reduce((sum, row) => sum + row.reliability, 0) / data.rows.length
    : 0;

  return (
    <AppShell>
      <SectionHeader
        code="AD · Alternative Data"
        title="Where is non-traditional evidence changing the research priority?"
        purpose="Alternative evidence is used to direct attention, not replace filings or price data. Live Wikipedia signals show method agreement, freshness, persistence and reliability; unsupported feeds remain clearly labelled rather than populated with placeholders."
      />

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Universe covered" value={`${data.coveredAssets}/${data.trackedAssets}`} detail={`${data.coverage.toFixed(0)}% has a usable baseline`} />
        <Kpi label="Attention spikes" value={String(data.spikeCount)} detail="Combined score at or above +2" tone="positive" />
        <Kpi label="Attention fades" value={String(data.fadeCount)} detail="Combined score at or below −1.5" tone="warning" />
        <Kpi label="Average reliability" value={`${averageReliability.toFixed(0)}%`} detail={`Latest source ${data.latestSignalDate ?? "unavailable"}`} />
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1.25fr)_minmax(340px,.75fr)]">
        <section className="rounded-md border border-border/70 bg-card/40 p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Live attention monitor</div>
              <h2 className="mt-0.5 text-sm font-semibold">Largest current departures from baseline</h2>
              <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">The combined reading averages conventional and outlier-resistant methods. Reliability falls when they disagree.</p>
            </div>
            <Link to="/alt-data/anomalies" className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground">Full ranking <ChevronRight className="h-3 w-3" /></Link>
          </div>
          <div className="mt-3 divide-y divide-border/50">
            {ranked.length ? ranked.map((row) => (
              <div key={row.symbol} className="grid gap-2 py-2 sm:grid-cols-[minmax(0,1fr)_90px_110px] sm:items-center">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold">{row.symbol}</span>
                    <State state={row.state} />
                  </div>
                  <div className="truncate text-[10px] text-muted-foreground">{row.name} · {row.persistenceDays}d persistent</div>
                </div>
                <div className={cn("text-right font-mono text-sm font-semibold", scoreTone(row.combinedScore))}>{row.combinedScore == null ? "—" : signed(row.combinedScore)}</div>
                <div><BandBar value={row.reliability} /></div>
              </div>
            )) : <Empty text="No reliable attention signal is available yet." />}
          </div>
        </section>

        <section className="rounded-md border border-border/70 bg-card/40 p-3">
          <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Evidence discipline</div>
          <h2 className="mt-0.5 text-sm font-semibold">What the signal can and cannot tell you</h2>
          <div className="mt-3 space-y-2 text-[10px] leading-relaxed text-muted-foreground">
            <Rule title="Useful for" text="Prioritising names where public attention has moved unusually far from the company's own recent baseline." />
            <Rule title="Needs confirmation from" text="Filings, earnings, news, price action and the deterministic fundamental or technical models." />
            <Rule title="Does not prove" text="Improving fundamentals, informed buying, future returns or that a spike is positive." />
            <Rule title="Reliability falls when" text="The history is thin, the feed is stale, or conventional and robust methods disagree." />
          </div>
          <Link to="/alt-data/model-health" className="mt-3 inline-flex items-center gap-1 text-[10px] text-[var(--primary)] hover:underline">Inspect model health <ChevronRight className="h-3 w-3" /></Link>
        </section>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <HubCard to="/alt-data/attention" icon={Sparkles} title="Attention Signals" detail="Company cards with baselines, persistence, charts and reliability." status="live" />
        <HubCard to="/alt-data/anomalies" icon={AlertTriangle} title="Anomaly Detector" detail="Rank conventional and robust departures with method agreement." status="live" />
        <HubCard to="/alt-data/model-health" icon={FlaskConical} title="Model Health" detail="Audit feed freshness, coverage, stability and run success." status="live" />
        <HubCard icon={Search} title="Search Trends" detail="Themed Google Trends baskets with seasonality controls." status="planned" />
        <HubCard icon={ShoppingBag} title="Retail Positioning" detail="CFTC positioning and disclosed retail-flow imbalances." status="planned" />
        <HubCard icon={MessageSquare} title="Sentiment Feeds" detail="Cross-source news and social sentiment with provenance." status="planned" />
        <HubCard icon={Truck} title="Supply Chain" detail="Freight, port throughput and inventory proxies." status="planned" />
        <HubCard icon={CloudSun} title="Weather & Commodities" detail="Weather anomalies mapped to exposed commodity markets." status="planned" />
      </div>
    </AppShell>
  );
}

function HubCard({
  to,
  icon: Icon,
  title,
  detail,
  status,
}: {
  to?: "/alt-data/attention" | "/alt-data/anomalies" | "/alt-data/model-health";
  icon: typeof Satellite;
  title: string;
  detail: string;
  status: "live" | "planned";
}) {
  const content = <><div className="flex items-start justify-between gap-2"><Icon className={cn("h-4 w-4", status === "live" ? "text-[var(--primary)]" : "text-muted-foreground")} /><span className={cn("rounded border px-1.5 py-0.5 font-mono text-[8px] uppercase", status === "live" ? "border-[var(--positive)]/40 text-[var(--positive)]" : "border-border text-muted-foreground")}>{status}</span></div><div className="mt-2 text-xs font-semibold">{title}</div><p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">{detail}</p></>;
  return to ? <Link to={to} className="rounded-md border border-border/70 bg-card/35 p-3 transition-colors hover:border-[var(--primary)]/45">{content}</Link> : <div className="rounded-md border border-border/60 bg-card/20 p-3 opacity-75">{content}</div>;
}

function Rule({ title, text }: { title: string; text: string }) {
  return <div className="rounded border border-border/55 bg-background/25 p-2"><span className="font-semibold text-foreground">{title}: </span>{text}</div>;
}

function State({ state }: { state: string }) {
  return <span className="rounded border border-border/60 px-1.5 py-0.5 font-mono text-[8px] uppercase text-muted-foreground">{state.replaceAll("_", " ")}</span>;
}

function Kpi({ label, value, detail, tone = "neutral" }: { label: string; value: string; detail: string; tone?: "neutral" | "positive" | "warning" }) {
  return <div className="rounded-md border border-border/70 bg-card/35 p-3"><div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div><div className={cn("mt-1 font-mono text-2xl font-semibold", tone === "positive" && "text-[var(--positive)]", tone === "warning" && "text-[var(--warning)]")}>{value}</div><div className="mt-1 text-[10px] text-muted-foreground">{detail}</div></div>;
}

function Empty({ text }: { text: string }) {
  return <div className="rounded border border-dashed border-border p-6 text-center text-xs text-muted-foreground">{text}</div>;
}

function signed(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}σ`;
}

function scoreTone(value: number | null): string {
  if (value == null) return "text-muted-foreground";
  if (value >= 2) return "text-[var(--negative)]";
  if (value <= -1.5) return "text-[var(--info)]";
  if (Math.abs(value) >= 1) return "text-[var(--warning)]";
  return "text-foreground";
}
