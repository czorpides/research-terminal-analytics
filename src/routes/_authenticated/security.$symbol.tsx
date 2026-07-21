import { createFileRoute, Link, useRouter, notFound } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { PanelGrid } from "@/components/research/PanelGrid";
import { getSecurityDetail } from "@/lib/panels/security.functions";

const detailQuery = (symbol: string) => queryOptions({
  queryKey: ["security", "detail", symbol],
  queryFn: () => getSecurityDetail({ data: { symbol } }),
});

export const Route = createFileRoute("/_authenticated/security/$symbol")({
  head: ({ params }) => ({ meta: [
    { title: `${params.symbol.toUpperCase()} — Security research` },
    { name: "description", content: `Auditable research deep dive for ${params.symbol.toUpperCase()}.` },
  ]}),
  loader: async ({ context, params }) => {
    const d = await context.queryClient.ensureQueryData(detailQuery(params.symbol));
    if (!d) throw notFound();
  },
  errorComponent: ({ error, reset }) => {
    const router = useRouter();
    return (
      <AppShell>
        <div className="p-4 text-sm text-[var(--negative)]">Failed to load security: {String(error)}</div>
        <button className="text-xs underline" onClick={() => { reset(); router.invalidate(); }}>Retry</button>
      </AppShell>
    );
  },
  notFoundComponent: () => (
    <AppShell>
      <div className="p-4 text-sm">Symbol not found in the universe.</div>
      <Link to="/security" className="text-xs underline">Back to Security Master</Link>
    </AppShell>
  ),
  component: Detail,
});

function Detail() {
  const { symbol } = Route.useParams();
  const { data } = useSuspenseQuery(detailQuery(symbol));
  if (!data) return null;
  const { identity, panels, priceHistory } = data;

  return (
    <AppShell>
      <Link to="/security" className="mb-2 inline-flex items-center gap-1 text-[11px] font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-3 w-3" /> Security Master
      </Link>
      <SectionHeader
        code={`SM · ${identity.symbol}`}
        title={`${identity.name} (${identity.symbol})`}
        purpose={`${[identity.exchange, identity.currency, identity.industry, identity.country].filter(Boolean).join(" · ") || "Reference identity"}. Every panel below is auditable.`}
      />
      {priceHistory.length > 0 && <Sparkline data={priceHistory} />}
      <div className="mt-3">
        <PanelGrid panels={panels} />
      </div>
    </AppShell>
  );
}

function Sparkline({ data }: { data: { date: string; close: number }[] }) {
  const w = 800, h = 80, pad = 4;
  const closes = data.map((d) => d.close);
  const min = Math.min(...closes), max = Math.max(...closes);
  const range = max - min || 1;
  const step = (w - pad * 2) / Math.max(data.length - 1, 1);
  const path = data.map((d, i) => {
    const x = pad + i * step;
    const y = h - pad - ((d.close - min) / range) * (h - pad * 2);
    return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const last = data[data.length - 1];
  const first = data[0];
  const chg = ((last.close / first.close) - 1) * 100;
  const tone = chg >= 0 ? "var(--positive)" : "var(--negative)";
  return (
    <div className="mt-3 rounded-md border border-border/70 bg-card/40 p-3">
      <div className="mb-1 flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        <span>Price · {data.length} bars · {first.date} → {last.date}</span>
        <span style={{ color: tone }}>{chg >= 0 ? "+" : ""}{chg.toFixed(1)}%</span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" preserveAspectRatio="none">
        <path d={path} fill="none" stroke={tone} strokeWidth="1" />
      </svg>
    </div>
  );
}